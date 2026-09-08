-- Nouveau type de bloc : support bureautique à télécharger (Word, Excel,
-- PowerPoint, OpenDocument, texte, CSV). Ajouter une valeur à un type énuméré
-- est une opération purement additive : aucune ligne existante n'est touchée.
ALTER TYPE "ContentBlockType" ADD VALUE IF NOT EXISTS 'file';
