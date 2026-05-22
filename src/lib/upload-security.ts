/**
 * Validation de sécurité pour les uploads d'images.
 *
 * Pourquoi : le check `file.type` côté navigateur est **spoofable**
 * (un attaquant peut renommer `malware.exe` en `image.png` et le navigateur
 * acceptera `Content-Type: image/png`). Il faut vérifier les **magic bytes**
 * — les premiers octets du fichier qui identifient son vrai format.
 *
 * Référence : https://en.wikipedia.org/wiki/List_of_file_signatures
 */

export type AllowedImageType = 'jpeg' | 'png' | 'webp' | 'gif'

export const ALLOWED_IMAGE_TYPES: AllowedImageType[] = ['jpeg', 'png', 'webp']

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

const MAX_FILE_SIZE_MB = 15 // 15 Mo avant compression

export type ValidationResult =
  | { valid: true; detectedType: AllowedImageType }
  | { valid: false; error: string }

/**
 * Lit les N premiers octets d'un File en tant qu'ArrayBuffer.
 */
async function readFirstBytes(file: File, n: number): Promise<Uint8Array> {
  const slice = file.slice(0, n)
  const buf = await slice.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Détecte le type réel d'une image en lisant ses magic bytes.
 * Retourne null si le format n'est pas reconnu / pas une image.
 */
async function detectImageType(file: File): Promise<AllowedImageType | null> {
  const bytes = await readFirstBytes(file, 16)
  if (bytes.length < 4) return null

  // JPEG : FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg'
  }

  // PNG : 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png'
  }

  // WebP : RIFF .. .. .. .. WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp'
  }

  // GIF : 47 49 46 38 37/39 61
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'gif'
  }

  return null
}

/**
 * Vérifie l'extension du nom de fichier (en plus des magic bytes).
 * Sert de double-check et de filtre rapide avant la lecture I/O.
 */
function hasAllowedExtension(filename: string): boolean {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return false
  const ext = filename.slice(lastDot + 1).toLowerCase()
  return ALLOWED_EXTENSIONS.has(ext)
}

/**
 * Valide qu'un File est bien une image autorisée :
 *  - extension correcte (jpg, jpeg, png, webp)
 *  - magic bytes correspondent à un type connu
 *  - type détecté est dans la whitelist
 *  - taille < 15 Mo
 *
 * Retourne { valid: true, detectedType } ou { valid: false, error }.
 */
export async function validateImageFile(file: File): Promise<ValidationResult> {
  // Taille
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return { valid: false, error: `Fichier trop lourd (max ${MAX_FILE_SIZE_MB} Mo)` }
  }
  if (file.size === 0) {
    return { valid: false, error: 'Fichier vide' }
  }

  // Extension (filtre rapide)
  if (!hasAllowedExtension(file.name)) {
    return { valid: false, error: 'Extension non autorisée. Formats acceptés : JPG, PNG, WebP' }
  }

  // Magic bytes (le vrai check)
  const detected = await detectImageType(file)
  if (!detected) {
    return { valid: false, error: 'Le fichier n\'est pas une image valide ou utilise un format non supporté.' }
  }
  if (!ALLOWED_IMAGE_TYPES.includes(detected)) {
    return { valid: false, error: `Format ${detected} non autorisé. Utilisez JPG, PNG ou WebP.` }
  }

  return { valid: true, detectedType: detected }
}

/**
 * Strip les métadonnées EXIF (notamment GPS) d'une image en la réencodant
 * via un canvas. Le canvas ignore par construction toutes les métadonnées.
 *
 * Cette fonction est utilisée comme fallback : browser-image-compression
 * supprime déjà l'EXIF lors de la recompression. Mais si l'image est
 * petite et n'est PAS compressée, EXIF reste. On force le strip via canvas.
 *
 * ⚠️ Hyper important : sans ce strip, une photo prise au téléphone
 * révèle les coordonnées GPS où elle a été prise → doxxing de l'artisan.
 */
export async function stripExifViaCanvas(file: File, detectedType: AllowedImageType): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Lecture fichier impossible'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Décodage image impossible'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas non supporté'))
        ctx.drawImage(img, 0, 0)
        // Réexporte selon le type détecté (pas le file.type, qui est spoofable)
        const mimeType = detectedType === 'png' ? 'image/png' :
                         detectedType === 'webp' ? 'image/webp' : 'image/jpeg'
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Encodage image échoué'))
          // Conserve le nom de fichier mais force l'extension correcte
          const baseName = file.name.replace(/\.[^.]+$/, '')
          const newExt = detectedType === 'png' ? 'png' : detectedType === 'webp' ? 'webp' : 'jpg'
          resolve(new File([blob], `${baseName}.${newExt}`, {
            type: mimeType,
            lastModified: Date.now(),
          }))
        }, mimeType, 0.92)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
