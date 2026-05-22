'use client'

import imageCompression from 'browser-image-compression'
import { logger } from '@/lib/logger'
import { validateImageFile, stripExifViaCanvas } from '@/lib/upload-security'

/**
 * Compresse une image côté navigateur avant upload.
 *
 * Avantages :
 *  - Économise l'espace Supabase Storage (plan gratuit = 1 Go)
 *  - Upload + affichage plus rapides
 *  - Réduit la facture bande passante
 *
 * Le format est conservé si possible (JPEG → JPEG, PNG → PNG).
 * Si l'image est déjà petite, on la retourne telle quelle.
 */

export type CompressionPreset = 'avatar' | 'gallery'

const PRESETS: Record<CompressionPreset, {
  maxSizeMB: number
  maxWidthOrHeight: number
}> = {
  // Avatar : carré ~300px max, < 200 Ko
  avatar: { maxSizeMB: 0.2, maxWidthOrHeight: 600 },
  // Gallery : grande image ~1600px max, < 800 Ko
  gallery: { maxSizeMB: 0.8, maxWidthOrHeight: 1600 },
}

/**
 * Valide + nettoie + compresse une image avant upload.
 *
 * Pipeline :
 *  1. Validation magic bytes (anti-spoof) + taille (max 15 Mo) + extension
 *  2. Compression si nécessaire (élimine aussi EXIF)
 *  3. Strip EXIF explicite via canvas si pas de compression
 *
 * Lance une erreur typée si la validation échoue. Le composant appelant
 * doit attraper et afficher le message.
 */
export async function compressImage(file: File, preset: CompressionPreset): Promise<File> {
  // 1. Validation stricte (magic bytes + taille + extension)
  const validation = await validateImageFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const cfg = PRESETS[preset]

  // 2. Si déjà petit : pas de compression, mais strip EXIF via canvas
  //    (sinon photo iPhone garde les coordonnées GPS → doxxing risk)
  if (file.size <= cfg.maxSizeMB * 1024 * 1024 * 0.7) {
    try {
      return await stripExifViaCanvas(file, validation.detectedType)
    } catch (e) {
      logger.warn('Strip EXIF échoué, upload sans strip:', e)
      return file
    }
  }

  // 3. Compression normale (browser-image-compression strip aussi EXIF)
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: cfg.maxSizeMB,
      maxWidthOrHeight: cfg.maxWidthOrHeight,
      useWebWorker: true,
      fileType: file.type,
      initialQuality: 0.85,
    })
    return new File([compressed], file.name, {
      type: compressed.type,
      lastModified: Date.now(),
    })
  } catch (e) {
    logger.warn('Compression image échouée, fallback strip EXIF seul:', e)
    try {
      return await stripExifViaCanvas(file, validation.detectedType)
    } catch {
      return file
    }
  }
}

/**
 * Helper : taille en Ko/Mo lisible
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
