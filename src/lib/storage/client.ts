import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CONTENT_BUCKET, SUBMISSION_BUCKET, DOCUMENT_BUCKET } from "./config";

// Le bucket est PRIVÉ : aucune URL publique n'existe. Chaque lecture passe par
// une URL signée de courte durée, délivrée seulement après vérification des
// droits du demandeur (voir src/app/api/fichiers/[blockId]/route.ts).
const SIGNED_URL_SECONDS = 60;

export async function createUploadUrl(path: string, bucket: string = CONTENT_BUCKET) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Envoi impossible : ${error?.message ?? "erreur inconnue"}`);
  return { signedUrl: data.signedUrl, token: data.token, path };
}

export async function createReadUrl(path: string, options: { download?: string; bucket?: string } = {}) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(options.bucket ?? CONTENT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS, options.download ? { download: options.download } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function removeFile(path: string, bucket: string = CONTENT_BUCKET) {
  const admin = createAdminClient();
  await admin.storage.from(bucket).remove([path]);
}

// Crée un bucket privé s'il n'existe pas (idempotent).
export async function ensureBucket(bucket: string) {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(bucket);
  if (data) return { created: false };
  const { error } = await admin.storage.createBucket(bucket, { public: false });
  if (error) throw new Error(`Création du bucket ${bucket} impossible : ${error.message}`);
  return { created: true };
}

export async function ensureContentBucket() {
  return ensureBucket(CONTENT_BUCKET);
}

export async function ensureSubmissionBucket() {
  return ensureBucket(SUBMISSION_BUCKET);
}

export async function ensureDocumentBucket() {
  return ensureBucket(DOCUMENT_BUCKET);
}
