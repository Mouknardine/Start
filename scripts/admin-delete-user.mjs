#!/usr/bin/env node
/**
 * Suppression administrative d'un compte (client ou artisan) par email.
 *
 * Même périmètre que delete_my_account() (migration 0012) + suppression du
 * compte auth via l'Admin API, mais déclenchée par l'exploitant, sans session
 * de l'utilisateur. Trace une ligne audit_logs (details.by_admin = true).
 *
 * Usage :
 *   npm run admin:delete-user -- <email>            # supprime
 *   npm run admin:delete-user -- <email> --dry-run  # inventaire seulement
 *
 * Variables : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local ok).
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const [email, ...rest] = process.argv.slice(2)
const dryRun = rest.includes('--dry-run')
if (!email || !email.includes('@')) {
  console.error('Usage : npm run admin:delete-user -- <email> [--dry-run]')
  process.exit(1)
}

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes')
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

// --- 1. Trouver le compte ----------------------------------------------------
const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 })
if (listErr) throw listErr
const user = list.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
if (!user) {
  console.error(`Aucun compte pour ${email}`)
  process.exit(2)
}
const { data: artisan } = await db.from('artisans').select('id, entreprise').eq('id', user.id).maybeSingle()
console.log(`Compte ${email} — id ${user.id} — ${artisan ? `artisan « ${artisan.entreprise} »` : 'client'}`)

// --- 2. Inventaire ------------------------------------------------------------
const count = async (table, col, val) => {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq(col, val)
  if (error) throw error
  return count || 0
}
const { data: demandesClient } = await db.from('demandes').select('id').eq('client_email', user.email)
const demandeIds = (demandesClient || []).map((d) => d.id)
const inv = {
  'demandes (client)': demandeIds.length,
  'messages (dans ces demandes)': 0,
  'avis (client)': await count('avis', 'client_email', user.email),
  'signalements (reporter)': await count('signalements', 'reporter_id', user.id),
}
if (demandeIds.length) {
  const { count: c } = await db.from('messages').select('*', { count: 'exact', head: true }).in('demande_id', demandeIds)
  inv['messages (dans ces demandes)'] = c || 0
}
if (artisan) {
  for (const t of ['demandes', 'avis', 'documents', 'prestations', 'employes', 'affectations', 'agenda_data']) {
    inv[`${t} (artisan)`] = await count(t, 'artisan_id', user.id)
  }
}
for (const [k, v] of Object.entries(inv)) console.log(`  ${k.padEnd(32)} ${v}`)

if (dryRun) {
  console.log('--dry-run : rien supprimé.')
  process.exit(0)
}

// --- 3. Purge (même ordre que delete_my_account) ------------------------------
const del = async (table, filter) => {
  let q = db.from(table).delete()
  for (const [col, op, val] of filter) q = op === 'in' ? q.in(col, val) : q.eq(col, val)
  const { error } = await q
  if (error) throw new Error(`${table} : ${error.message}`)
}

await db.from('audit_logs').insert({
  actor_id: null,
  actor_email: 'admin-script',
  action: 'self_delete_account',
  target_type: 'user',
  target_id: user.id,
  details: { by_admin: true, email: user.email, was_artisan: Boolean(artisan), inventory: inv },
})

if (artisan) {
  const { data: dArt } = await db.from('demandes').select('id').eq('artisan_id', user.id)
  const ids = (dArt || []).map((d) => d.id)
  if (ids.length) await del('messages', [['demande_id', 'in', ids]])
  for (const t of ['affectations', 'employes', 'documents', 'prestations', 'demandes', 'avis', 'agenda_data']) {
    await del(t, [['artisan_id', 'eq', user.id]])
  }
  await del('artisans', [['id', 'eq', user.id]])
}
if (demandeIds.length) await del('messages', [['demande_id', 'in', demandeIds]])
await del('demandes', [['client_email', 'eq', user.email]])
await del('avis', [['client_email', 'eq', user.email]])
await del('signalements', [['reporter_id', 'eq', user.id]])

// Storage (artisan-media/{userId}/) — best effort
try {
  const { data: files } = await db.storage.from('artisan-media').list(user.id)
  if (files?.length) await db.storage.from('artisan-media').remove(files.map((f) => `${user.id}/${f.name}`))
} catch (e) {
  console.warn('Storage : ', e.message)
}

// --- 4. Compte auth -----------------------------------------------------------
const { error: authErr } = await db.auth.admin.deleteUser(user.id)
if (authErr) throw authErr
console.log(`✓ ${email} supprimé (données métier + compte auth).`)
