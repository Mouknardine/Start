#!/usr/bin/env node
/**
 * Référentiel des localités suisses → table public.localites (migration 0014).
 *
 * Source officielle : swisstopo, « Amtliches Ortschaftenverzeichnis mit
 * Postleitzahl » (WGS84). Mise à jour mensuelle, licence ouverte.
 *
 * Usage :
 *   npm run seed:localites                     # télécharge + upsert en DB
 *   npm run seed:localites -- --csv fichier.csv
 *   npm run seed:localites -- --emit-sql       # régénère 0015_localites_seed.sql, sans toucher la DB
 *
 * Variables : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (lues dans .env.local si absentes de l'environnement).
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const SOURCE_URL =
  'https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_4326.csv.zip'
const MIGRATION_FILE = 'supabase/migrations/0015_localites_seed.sql'
const BATCH = 1000

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(name)
const option = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

// --- env ---------------------------------------------------------------------
function loadEnvLocal() {
  if (!existsSync('.env.local')) return
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

// --- source ------------------------------------------------------------------
async function downloadCsv() {
  console.log(`Téléchargement ${SOURCE_URL}`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`swisstopo ${res.status}`)
  const dir = mkdtempSync(join(tmpdir(), 'plz-'))
  const zip = join(dir, 'plz.zip')
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir])
  return join(dir, 'AMTOVZ_CSV_WGS84', 'AMTOVZ_CSV_WGS84.csv')
}

/** Parse le CSV (UTF-8 BOM, séparateur « ; »), dédoublonne sur (nom, NPA). */
function parseCsv(path) {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '')
  const [header, ...lines] = text.split(/\r?\n/).filter(Boolean)
  const cols = header.split(';')
  const col = (name) => {
    const i = cols.indexOf(name)
    if (i < 0) throw new Error(`Colonne manquante : ${name}`)
    return i
  }
  const iNom = col('Ortschaftsname'), iNpa = col('PLZ4'), iCommune = col('Gemeindename')
  const iBfs = col('BFS-Nr'), iCanton = col('Kantonskürzel'), iE = col('E'), iN = col('N'), iLang = col('Sprache')

  const seen = new Set()
  const rows = []
  for (const line of lines) {
    const c = line.split(';')
    const canton = (c[iCanton] || '').trim()
    if (!canton) continue // enclaves étrangères (Büsingen, Campione…) : hors périmètre
    const nom = c[iNom].trim()
    const npa = Number(c[iNpa])
    const key = `${nom}|${npa}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      npa,
      nom,
      commune: c[iCommune].trim(),
      bfs_nr: Number(c[iBfs]),
      canton,
      lat: Number(c[iN]),
      lng: Number(c[iE]),
      langue: (c[iLang] || '').trim() || null,
    })
  }
  return rows
}

// --- sortie SQL (migration 0015) ---------------------------------------------
function emitSql(rows) {
  const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`)
  const values = (r) =>
    `(${r.npa},${q(r.nom)},${q(r.commune)},${r.bfs_nr},${q(r.canton)},${r.lat.toFixed(6)},${r.lng.toFixed(6)},${q(r.langue)})`
  const header = `-- ============================================================================
-- 0015_localites_seed.sql
-- ============================================================================
-- Référentiel officiel des localités suisses (swisstopo, « Amtliches
-- Ortschaftenverzeichnis mit Postleitzahl », WGS84). 26 cantons, ${rows.length} localités.
-- Source : https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/
-- Généré par scripts/seed-localites.mjs --emit-sql — ne pas éditer à la main.
-- Idempotent (ON CONFLICT). Dépend de 0014 (table public.localites).
-- ============================================================================

`
  const parts = [header]
  for (let i = 0; i < rows.length; i += 500) {
    parts.push(
      'INSERT INTO public.localites (npa, nom, commune, bfs_nr, canton, lat, lng, langue) VALUES\n' +
        rows.slice(i, i + 500).map(values).join(',\n') +
        '\nON CONFLICT (nom, npa) DO UPDATE SET commune = EXCLUDED.commune, bfs_nr = EXCLUDED.bfs_nr, canton = EXCLUDED.canton, lat = EXCLUDED.lat, lng = EXCLUDED.lng, langue = EXCLUDED.langue;\n\n',
    )
  }
  writeFileSync(MIGRATION_FILE, parts.join(''))
  console.log(`✓ ${MIGRATION_FILE} régénéré (${rows.length} localités)`)
}

// --- upsert DB ---------------------------------------------------------------
async function seed(rows) {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes')
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase.from('localites').upsert(batch, { onConflict: 'nom,npa' })
    if (error) throw new Error(`Batch ${i / BATCH + 1} : ${error.message}`)
    done += batch.length
    console.log(`  ${done}/${rows.length}`)
  }

  const { count, error } = await supabase.from('localites').select('*', { count: 'exact', head: true })
  if (error) throw error
  console.log(`✓ localites : ${count} lignes en base`)
}

// --- main --------------------------------------------------------------------
const csvPath = option('--csv') || (await downloadCsv())
const rows = parseCsv(csvPath)
console.log(`${rows.length} localités, ${new Set(rows.map((r) => r.canton)).size} cantons`)

if (hasFlag('--emit-sql')) emitSql(rows)
else await seed(rows)
