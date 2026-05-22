export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
export const DAY_NAMES_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
export const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export const MONTH_NAMES_CAP = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
export const TOTAL_ROWS = 20
export const GRID_START_MIN = 480 // 8h00 in minutes

export const TIME_LABELS: { label: string; isHalf: boolean }[] = []
for (let r = 0; r < TOTAL_ROWS; r++) {
  const totalMin = GRID_START_MIN + r * 30
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (m === 0) TIME_LABELS.push({ label: `${h}h00`, isHalf: false })
  else TIME_LABELS.push({ label: '', isHalf: true })
}
