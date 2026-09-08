"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { canManageDocument, checkDocumentAccess } from "@/lib/storage/access";
import { downloadFile, uploadFile } from "@/lib/storage/client";
import { DOCUMENT_BUCKET } from "@/lib/storage/config";
import { createSignatureRequest, getSignatureRequest, downloadSignedPdf, isCompleted, isDeclined } from "@/lib/signature/signwell";
import { resolveSigner, isSignatureTest } from "@/lib/signature/config";
import { sendMail } from "@/lib/mail/send";
import { renderMessage } from "@/lib/messages/render";
import { SIGNATURE_REQUEST_TEMPLATE } from "@/lib/messages/notification";

export type SignatureState = { ok: boolean; message: string };

// Qui doit signer : le titulaire de la pièce. Un document d'élève est signé par
// l'élève, un document d'entreprise par son contact.
async function intendedSigner(documentId: string) {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: {
      owner: { select: { name: true, email: true } },
      company: { select: { name: true, contactName: true, contactEmail: true } },
    },
  });
  if (document.owner) return { name: document.owner.name, email: document.owner.email };
  if (document.company?.contactEmail) {
    return { name: document.company.contactName ?? document.company.name, email: document.company.contactEmail };
  }
  return null;
}

export async function requestSignature(documentId: string): Promise<SignatureState> {
  const me = await requirePermission("can_manage_sessions");
  if (!(await canManageDocument(documentId, me))) return { ok: false, message: "Pièce introuvable." };

  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { id: true, title: true, type: true, storagePath: true, signatureStatus: true, archivedAt: true, ownerUserId: true, companyId: true, sessionId: true, formationId: true },
  });
  if (document.archivedAt) return { ok: false, message: "Pièce retirée du dossier." };
  if (document.signatureStatus !== "na") return { ok: false, message: "Une signature est déjà engagée sur cette pièce." };

  const intended = await intendedSigner(documentId);
  if (!intended) return { ok: false, message: "Aucun signataire : renseigne l'email de contact de l'entreprise." };

  const file = await downloadFile(document.storagePath, DOCUMENT_BUCKET);
  if (!file) return { ok: false, message: "Fichier introuvable dans le stockage." };

  const signer = resolveSigner(intended);
  const result = await createSignatureRequest({
    title: document.title,
    // Le nom envoyé au prestataire est l'intitulé de la pièce : c'est ce que
    // le signataire lit en haut de sa fenêtre de signature.
    fileName: `${document.title}.pdf`,
    file,
    signer,
    message: "Merci de relire puis de signer ce document depuis votre espace de formation.",
  });
  if (!result.ok) return { ok: false, message: result.error };

  await prisma.document.update({
    where: { id: documentId },
    data: { signatureStatus: "pending", signatureProviderId: result.document.id },
  });

  // Un élève signe depuis son espace : il n'a rien à recevoir. Un contact
  // d'entreprise n'a pas de compte — et la signature embarquée empêche
  // SignWell de lui écrire — donc c'est NOUS qui lui envoyons le lien, par
  // Resend, ce qui replace cet envoi sous le garde-fou du bac à sable.
  let mailNote = "";
  if (!document.ownerUserId) {
    const url = result.document.recipients?.[0]?.embedded_signing_url;
    if (!url) {
      mailNote = " Lien de signature indisponible : préviens le signataire toi-même.";
    } else {
      const values: Record<string, string> = {
        "destinataire.prenom": intended.name.split(" ")[0] ?? intended.name,
        "demandeur.nom": me.name,
        "document.titre": document.title,
        "formation.nom": "",
        lien_signature: url,
      };
      const rendered = renderMessage(SIGNATURE_REQUEST_TEMPLATE, values);
      const sent = await sendMail({ intendedTo: intended.email, subject: rendered.subject, html: rendered.html, text: rendered.text });
      mailNote = sent.ok
        ? ` Lien de signature envoyé à ${sent.sentTo}${sent.redirected ? " (bac à sable)" : ""}.`
        : ` Le lien n'a pas pu être envoyé : ${sent.error}`;
    }
  }
  await prisma.accessLog.create({
    data: { userId: me.id, action: "request_signature", targetType: "document", targetId: documentId },
  });

  revalidateDocument(document);
  return {
    ok: true,
    message:
      (signer.redirected
        ? `Demande créée en mode test pour ${signer.email} : aucune valeur juridique, et ${intended.email} n'est pas sollicité.`
        : `Demande de signature créée pour ${intended.email}.`) + mailNote,
  };
}

// Lien de signature du demandeur pour cette pièce. Chacun n'obtient que le
// sien : l'URL SignWell vaut authentification, elle ne doit jamais circuler.
export async function getSigningUrl(documentId: string): Promise<{ url: string } | { error: string }> {
  const me = await requireUser();
  const access = await checkDocumentAccess(documentId, me);
  if (!access.allowed) return { error: "Pièce introuvable." };

  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { signatureProviderId: true, signatureStatus: true, ownerUserId: true },
  });
  if (document.signatureStatus !== "pending" || !document.signatureProviderId) {
    return { error: "Aucune signature en attente sur cette pièce." };
  }
  // En mode test, l'encadrement peut ouvrir le lien pour dérouler le parcours ;
  // en production, seul le titulaire de la pièce signe depuis la plateforme.
  if (access.role !== "holder" && !isSignatureTest()) return { error: "Cette signature ne vous est pas destinée." };

  const remote = await getSignatureRequest(document.signatureProviderId);
  const url = remote?.recipients?.[0]?.embedded_signing_url;
  if (!url) return { error: "Lien de signature indisponible." };
  return { url };
}

// Reprise du statut auprès de SignWell. Le webhook fait la même chose en
// production ; ce bouton permet de ne pas dépendre d'une URL publique en
// développement, et de rattraper un webhook manqué.
export async function refreshSignature(documentId: string): Promise<SignatureState> {
  const me = await requireUser();
  const access = await checkDocumentAccess(documentId, me);
  if (!access.allowed) return { ok: false, message: "Pièce introuvable." };

  const outcome = await syncSignature(documentId);
  return outcome;
}

// Cœur de la synchronisation, appelé par le bouton comme par le webhook.
export async function syncSignature(documentId: string): Promise<SignatureState> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, storagePath: true, signatureProviderId: true, signatureStatus: true, ownerUserId: true, companyId: true, sessionId: true, formationId: true },
  });
  if (!document?.signatureProviderId) return { ok: false, message: "Aucune demande de signature." };
  if (document.signatureStatus === "signed") return { ok: true, message: "Déjà signée." };

  const remote = await getSignatureRequest(document.signatureProviderId);
  if (!remote) return { ok: false, message: "Demande introuvable chez le prestataire." };

  if (isDeclined(remote.status)) {
    // Refus : la pièce redevient libre, on pourra relancer une demande.
    await prisma.document.update({
      where: { id: documentId },
      data: { signatureStatus: "na", signatureProviderId: null },
    });
    revalidateDocument(document);
    return { ok: false, message: "Signature refusée par le signataire." };
  }

  if (!isCompleted(remote.status)) {
    return { ok: true, message: `Toujours en attente (${remote.status}).` };
  }

  // Le document signé est conservé À CÔTÉ de l'original : on ne réécrit jamais
  // par-dessus une pièce déposée.
  const signed = await downloadSignedPdf(document.signatureProviderId);
  if (!signed) return { ok: false, message: "Document signé indisponible." };

  const signedPath = document.storagePath.replace(/(\.[a-z0-9]+)?$/i, "") + "-signe.pdf";
  const stored = await uploadFile(signedPath, signed, { bucket: DOCUMENT_BUCKET, contentType: "application/pdf" });
  if (!stored) return { ok: false, message: "Enregistrement du document signé impossible." };

  await prisma.document.update({
    where: { id: documentId },
    data: { signatureStatus: "signed", signedAt: new Date(), storagePath: signedPath, mimeType: "application/pdf", sizeBytes: signed.byteLength },
  });

  revalidateDocument(document);
  return { ok: true, message: "Document signé et classé au dossier." };
}

function revalidateDocument(d: { ownerUserId?: string | null; companyId?: string | null; sessionId?: string | null; formationId?: string | null }) {
  if (d.ownerUserId) revalidatePath(`/admin/eleves/${d.ownerUserId}`);
  if (d.companyId) revalidatePath(`/admin/entreprises/${d.companyId}`);
  if (d.sessionId) {
    revalidatePath(`/admin/sessions/${d.sessionId}`);
    revalidatePath(`/espace/sessions/${d.sessionId}/documents`);
  }
  if (d.formationId) revalidatePath(`/admin/formations/${d.formationId}`);
}
