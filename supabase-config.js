/* ===== ARTISANO SUPABASE CONFIG ===== */

// Échapper le HTML pour éviter les failles XSS
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Initialisation du client Supabase
var SUPABASE_URL = 'https://qonowxahjffayegvyqmq.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvbm93eGFoamZmYXllZ3Z5cW1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTY2NDEsImV4cCI6MjA4OTQzMjY0MX0.OrSijcsho_YQStcDMvTaJEXDF-Q7jbbbjT4-h_Okrw0';

var _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== AUTH HELPERS =====

// Récupérer l'utilisateur connecté (ou null)
async function getUser() {
  var { data } = await _sb.auth.getUser();
  return data.user;
}

// Récupérer la session active (ou null)
async function getSession() {
  var { data } = await _sb.auth.getSession();
  return data.session;
}

// Vérifier si connecté
async function isLoggedIn() {
  var session = await getSession();
  return !!session;
}

// Inscription artisan (email + mot de passe)
async function signUpArtisan(email, password) {
  var { data, error } = await _sb.auth.signUp({ email: email, password: password });
  if (error) throw error;
  return data;
}

// Connexion artisan (email + mot de passe)
async function signInArtisan(email, password) {
  var { data, error } = await _sb.auth.signInWithPassword({ email: email, password: password });
  if (error) throw error;
  return data;
}

// Inscription client (email + mot de passe)
async function signUpClient(email, password) {
  var { data, error } = await _sb.auth.signUp({ email: email, password: password });
  if (error) throw error;
  return data;
}

// Connexion client (email + mot de passe)
async function signInClient(email, password) {
  var { data, error } = await _sb.auth.signInWithPassword({ email: email, password: password });
  if (error) throw error;
  return data;
}

// Déconnexion
async function logout() {
  await _sb.auth.signOut();
  window.location.href = 'connexion.html';
}

// Suppression de compte artisan (données + déconnexion)
async function deleteAccountData(userId) {
  await _sb.from('documents').delete().eq('artisan_id', userId);
  await _sb.from('prestations').delete().eq('artisan_id', userId);
  await _sb.from('demandes').delete().eq('artisan_id', userId);
  await _sb.from('avis').delete().eq('artisan_id', userId);
  await _sb.from('artisans').delete().eq('id', userId);
  await _sb.auth.signOut();
}

// Suppression de compte client (demandes + avis par email, puis déconnexion)
async function deleteClientAccountData(email) {
  await _sb.from('demandes').delete().eq('client_email', email);
  await _sb.from('avis').delete().eq('client_email', email);
  await _sb.auth.signOut();
}

// ===== PROFIL ARTISAN HELPERS =====

// Sauvegarder le profil artisan dans Supabase
async function saveArtisanProfile(userId, profileData) {
  var row = {
    id: userId,
    prenom: profileData.prenom || '',
    nom: profileData.nom || '',
    entreprise: profileData.entreprise || '',
    telephone: profileData.telephone || '',
    email: profileData.email || '',
    adresse: profileData.adresse || '',
    site: profileData.site || '',
    metier: profileData.metier || '',
    specialites: profileData.specialites || [],
    zones: profileData.zones || [],
    description: profileData.description || '',
    horaires: profileData.horaires || [],
    urgence: profileData.urgence || false,
    urgence_supplement: profileData.urgenceSupplement || '',
    urgence_rayon: profileData.urgenceRayon || '',
    urgence_heure_debut: profileData.urgenceHeureDebut || '',
    urgence_heure_fin: profileData.urgenceHeureFin || '',
    urgence_jours: profileData.urgenceJours || [],
    contact_prefs: profileData.contactPrefs || { complete: true, message: true, appel: true },
    avatar_url: profileData.avatarUrl || '',
    gallery_urls: profileData.galleryUrls || [],
    bank_iban: profileData.bankIban || '',
    bank_titulaire: profileData.bankTitulaire || '',
    bank_adresse: profileData.bankAdresse || '',
    bank_bic: profileData.bankBic || ''
  };

  // Préserver les disponibilites si elles existent dans les données
  if (profileData.disponibilites !== undefined) {
    row.disponibilites = profileData.disponibilites;
  }

  var { data, error } = await _sb.from('artisans').upsert(row);
  if (error) throw error;
  return data;
}

// Charger le profil artisan depuis Supabase
async function loadArtisanProfile(userId) {
  var { data, error } = await _sb.from('artisans').select('*').eq('id', userId).single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data;
}

// Convertir un profil DB vers le format localStorage (camelCase)
function dbProfileToLocal(dbRow) {
  if (!dbRow) return null;
  return {
    prenom: dbRow.prenom,
    nom: dbRow.nom,
    entreprise: dbRow.entreprise,
    telephone: dbRow.telephone,
    email: dbRow.email,
    adresse: dbRow.adresse,
    site: dbRow.site,
    metier: dbRow.metier,
    specialites: dbRow.specialites || [],
    zones: dbRow.zones || [],
    description: dbRow.description,
    horaires: dbRow.horaires || [],
    urgence: dbRow.urgence,
    urgenceSupplement: dbRow.urgence_supplement,
    urgenceRayon: dbRow.urgence_rayon,
    urgenceHeureDebut: dbRow.urgence_heure_debut,
    urgenceHeureFin: dbRow.urgence_heure_fin,
    urgenceJours: dbRow.urgence_jours || [],
    contactPrefs: dbRow.contact_prefs || { complete: true, message: true, appel: true },
    disponibilites: dbRow.disponibilites || null,
    avatarUrl: dbRow.avatar_url || '',
    galleryUrls: dbRow.gallery_urls || [],
    bankIban: dbRow.bank_iban || '',
    bankTitulaire: dbRow.bank_titulaire || '',
    bankAdresse: dbRow.bank_adresse || '',
    bankBic: dbRow.bank_bic || ''
  };
}

// ===== STORAGE HELPERS =====

// Upload un fichier vers Supabase Storage (bucket artisan-media)
async function uploadToStorage(userId, filePath, file) {
  var { data, error } = await _sb.storage
    .from('artisan-media')
    .upload(userId + '/' + filePath, file, {
      cacheControl: '3600',
      upsert: true
    });
  if (error) throw error;
  // Retourner l'URL publique
  var { data: urlData } = _sb.storage
    .from('artisan-media')
    .getPublicUrl(userId + '/' + filePath);
  return urlData.publicUrl;
}

// Supprimer un fichier de Supabase Storage
async function deleteFromStorage(userId, filePath) {
  var { error } = await _sb.storage
    .from('artisan-media')
    .remove([userId + '/' + filePath]);
  if (error) throw error;
}

// Mettre à jour uniquement avatar_url dans la table artisans
async function updateAvatarUrl(userId, url) {
  var { error } = await _sb.from('artisans').update({ avatar_url: url }).eq('id', userId);
  if (error) throw error;
}

// Mettre à jour uniquement gallery_urls dans la table artisans
async function updateGalleryUrls(userId, urls) {
  var { error } = await _sb.from('artisans').update({ gallery_urls: urls }).eq('id', userId);
  if (error) throw error;
}

// ===== FACTURATION HELPERS =====

async function loadDocuments(userId) {
  var { data, error } = await _sb.from('documents').select('*').eq('artisan_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function saveDocumentToDB(doc) {
  var { data, error } = await _sb.from('documents').upsert(doc).select().single();
  if (error) throw error;
  return data;
}

async function deleteDocumentFromDB(id) {
  var { error } = await _sb.from('documents').delete().eq('id', id);
  if (error) throw error;
}

async function loadPrestations(userId) {
  var { data, error } = await _sb.from('prestations').select('*').eq('artisan_id', userId).order('ordre');
  if (error) throw error;
  return data || [];
}

async function savePrestationToDB(prest) {
  var { data, error } = await _sb.from('prestations').upsert(prest).select().single();
  if (error) throw error;
  return data;
}

async function deletePrestationFromDB(id) {
  var { error } = await _sb.from('prestations').delete().eq('id', id);
  if (error) throw error;
}

async function getNextDocNumber(userId, type) {
  var { data, error } = await _sb.rpc('next_document_number', { p_artisan_id: userId, p_type: type });
  if (error) throw error;
  return data;
}

// ===== DEMANDES HELPERS =====

async function loadDemandes(userId) {
  var { data, error } = await _sb.from('demandes').select('*').eq('artisan_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function updateDemandeStatus(demandeId, newStatus) {
  var { data, error } = await _sb.from('demandes').update({ statut: newStatus }).eq('id', demandeId).select().single();
  if (error) throw error;
  return data;
}

async function deleteDemandeFromDB(demandeId) {
  var { error } = await _sb.from('demandes').delete().eq('id', demandeId);
  if (error) throw error;
}

// ===== AVIS HELPERS =====

async function loadAvisForArtisan(userId) {
  var { data, error } = await _sb.from('avis').select('*').eq('artisan_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function replyToAvis(avisId, reponse) {
  var { error } = await _sb.from('avis').update({ reponse_artisan: reponse, reponse_date: new Date().toISOString() }).eq('id', avisId);
  if (error) throw error;
}

// ===== GESTION D'ÉQUIPE HELPERS =====

async function getEmployes(artisanId) {
  var { data, error } = await _sb.from('employes').select('*').eq('artisan_id', artisanId).eq('actif', true).order('prenom');
  if (error) throw error;
  return data || [];
}

async function addEmploye(data) {
  var { data: result, error } = await _sb.from('employes').insert(data).select().single();
  if (error) throw error;
  return result;
}

async function updateEmploye(id, data) {
  var { error } = await _sb.from('employes').update(data).eq('id', id);
  if (error) throw error;
}

async function deleteEmploye(id) {
  var { error } = await _sb.from('employes').update({ actif: false }).eq('id', id);
  if (error) throw error;
}

async function getAffectations(artisanId, dateDebut, dateFin) {
  var { data, error } = await _sb.from('affectations').select('*, employes(prenom, nom, couleur)').eq('artisan_id', artisanId).gte('date_debut', dateDebut).lte('date_debut', dateFin).order('heure_debut');
  if (error) throw error;
  return data || [];
}

async function addAffectation(data) {
  var { data: result, error } = await _sb.from('affectations').insert(data).select('*, employes(prenom, nom, couleur)').single();
  if (error) throw error;
  return result;
}

async function updateAffectation(id, data) {
  var { error } = await _sb.from('affectations').update(data).eq('id', id);
  if (error) throw error;
}

async function deleteAffectation(id) {
  var { error } = await _sb.from('affectations').delete().eq('id', id);
  if (error) throw error;
}

// ===== PROTECTION DES PAGES =====

// Appeler sur les pages qui nécessitent une connexion (dashboard, mon-profil)
async function requireAuth() {
  var session = await getSession();
  if (!session) {
    window.location.href = 'connexion.html';
    return null;
  }
  return session.user;
}

// Rediriger si déjà connecté — détecte artisan vs client
async function redirectIfLoggedIn(destination) {
  var session = await getSession();
  if (session) {
    // Vérifier si l'utilisateur a un profil artisan
    try {
      var { data } = await _sb.from('artisans').select('id').eq('id', session.user.id).single();
      if (data) {
        window.location.href = destination || 'dashboard.html';
      } else {
        window.location.href = 'client.html';
      }
    } catch(e) {
      // Pas de profil artisan → c'est un client
      window.location.href = 'client.html';
    }
  }
}

// Charger les demandes d'un client par son email
async function loadClientDemandes(email) {
  var { data, error } = await _sb.from('demandes').select('*, artisans(entreprise, prenom, nom, metier, avatar_url)').eq('client_email', email).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Supprimer une demande client (par son email)
async function deleteClientDemandeFromDB(demandeId, email) {
  var { error } = await _sb.from('demandes').delete().eq('id', demandeId).eq('client_email', email);
  if (error) throw error;
}

// Charger les avis d'un client par son email
async function loadClientAvis(email) {
  var { data, error } = await _sb.from('avis').select('*, artisans(entreprise, prenom, nom)').eq('client_email', email).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
