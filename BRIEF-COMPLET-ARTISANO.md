# ARTISANO — Brief complet du projet pour Claude Code

## 1. Vision du projet

Artisano est une plateforme de réservation pour artisans en Suisse romande. Elle permet à un client de trouver un artisan local, consulter son profil, lire des avis vérifiés, puis le contacter pour un rendez-vous ou un devis. L'accès est gratuit pour le client. Les artisans paient un abonnement mensuel ou annuel.

Ce n'est PAS un annuaire passif. C'est un annuaire actif avec :
- des profils détaillés
- un vrai système d'agenda en temps réel
- des avis vérifiés (seuls les clients passés par la plateforme et dont l'intervention est confirmée peuvent noter)
- une IA d'orientation pour les clients qui ne savent pas quel métier chercher
- plusieurs modes de contact (appel, message rapide, demande complète)

Le cœur du business : apporter des demandes locales qualifiées à des artisans qui paient un abonnement raisonnable.

---

## 2. Stack technique choisie

- **Frontend** : Next.js (React) — pour le SSR et le SEO local
- **Backend** : Node.js (Express ou Fastify) — même langage que le front, TypeScript partout
- **Base de données** : PostgreSQL avec PostGIS — données relationnelles + recherche géographique
- **Hébergement** : Infomaniak — serveurs en Suisse, conformité nLPD
- **Stockage images** : Infomaniak Object Storage (compatible S3)
- **Paiements** : Stripe — abonnements mensuels/annuels
- **Notifications** : Resend (emails) + Twilio (SMS)
- **IA d'orientation** : API LLM (OpenAI ou Anthropic) — prompt simple pour orienter le client vers le bon métier

---

## 3. Palette de couleurs

Inspirée de l'univers artisanal (orange chantier, bleu ouvrier, jaune sécurité) mais raffinée pour une plateforme moderne :

```
--orange: #E8700A        (couleur d'action principale — boutons, liens, accents)
--orange-light: #F08A2E  (hover)
--orange-dark: #CC5F00   (hover pressé)
--yellow: #F0B429        (accents secondaires, étoiles de notation, décoratif)
--yellow-light: #F7C948
--dark: #1A2744          (textes, navigation, fond sombre — bleu marine profond)
--dark-mid: #213052
--dark-light: #2B3D68
--white: #FAFAF8         (fond de page, légèrement chaud)
--gray-100: #F2F1EE      (fond secondaire, cartes sur fond gris)
--gray-200: #E5E3DE      (bordures)
--gray-300: #D1CEC7      (bordures hover)
--gray-500: #8A8680      (texte secondaire)
--gray-700: #55524D      (texte intermédiaire)
--green: #2E7D32         (disponibilité, succès, avis vérifiés)
--green-light: #E8F5E9
--red: #D32F2F           (erreurs)
--blue: #1565C0          (informations)
--blue-light: #E3F2FD
```

Typographies : Sora (titres, font-weight 700-800) + DM Sans (corps de texte). PAS d'emoji nulle part — uniquement des icônes SVG.

---

## 4. Les 8 prototypes HTML et leur rôle

Tous les fichiers sont des prototypes HTML statiques autonomes qui servent de maquettes interactives. Ils sont dans le dossier outputs.

### 4.1 artisano-homepage.html
**Page d'accueil publique**

Contient :
- Navigation fixe avec logo, liens, bouton Connexion
- Hero avec titre "Ton artisan local, en 2 clics"
- Barre de recherche double champ : métier + zone géographique
- Bouton IA "Pas sûr du métier ? Décris ton problème, on t'oriente"
- Statistiques (artisans inscrits, note moyenne, avis vérifiés)
- Grille de 4 métiers prioritaires (plombier, électricien, serrurier, chauffagiste) avec icônes SVG
- Section "Simple comme bonjour" en 4 étapes (recherche, compare, contacte, avis)
- CTA artisan "T'es artisan ? Rejoins-nous" avec prix (dès 25 CHF/mois)
- Footer

Pas de section "artisans populaires" (retirée volontairement pour ne pas décourager les nouveaux inscrits).

Ton de la page : tutoiement, accessible, direct, proche du voisin.

### 4.2 artisano-resultats-recherche.html
**Page de résultats après recherche**

Contient :
- Navigation avec barre de recherche intégrée (compacte, pré-remplie avec la recherche en cours)
- Breadcrumb (Accueil > Plombier > Lausanne)
- Titre "Plombier à Lausanne" + nombre de résultats
- Ligne de filtres : Tous, Disponible cette semaine, Avis vérifiés uniquement, Note 4 étoiles et plus
- Barre de tri : par proximité, meilleure note, plus d'avis, disponibilité
- Cartes artisans horizontales en grille fixe (200px image | flexible corps | 240px sidebar)
  - Image/logo à gauche avec badges (Disponible, Vérifié)
  - Corps : nom, note + nombre d'avis, métier, zone, tags spécialités, description tronquée
  - Sidebar droite : prochaines disponibilités avec créneaux concrets + boutons "Voir le profil" et "Demander un devis"
- Pagination en bas

Les cartes doivent être uniformes (même hauteur, même structure). 5 exemples d'artisans fictifs sont inclus.

### 4.3 artisano-profil-artisan.html
**Page profil complet d'un artisan**

Contient :
- Navigation avec bouton retour
- Breadcrumb
- En-tête profil : avatar, nom, métier, zone, téléphone, disponibilité, étoiles + note + nombre d'avis
- Boutons "Prendre rendez-vous" et "Demander un devis"
- Onglets : Présentation, Disponibilités, Galerie, Avis
- Colonne gauche :
  - À propos (description libre)
  - Spécialités (chips avec icônes SVG)
  - Zone d'intervention (tags bleus avec communes)
  - Galerie de réalisations (grille de photos placeholder)
  - Avis clients avec note globale, avis individuels (auteur, date, étoiles, texte, badge "Avis vérifié")
- Sidebar droite (sticky) :
  - Disponibilités semaine par semaine avec créneaux cliquables (ce sont les VRAIS créneaux publiés depuis l'agenda du dashboard, pas des horaires d'ouverture)
  - Coordonnées (téléphone, email, adresse, horaires d'ouverture)
  - Encadré expliquant le système d'avis vérifiés
- CTA mobile flottant en bas sur petit écran

Tout en toutes lettres : jours complets (Lundi, Mardi...), pas d'abréviations.

### 4.4 artisano-inscription-pro.html
**Formulaire d'inscription artisan en 4 étapes**

Layout : panneau gauche sombre (avantages + prix) + panneau droit (formulaire) avec stepper en haut.

**Étape 1 — Votre entreprise :**
Prénom, nom, nom d'entreprise, email, téléphone, adresse, site internet (facultatif), mot de passe, confirmation mot de passe.

**Étape 2 — Votre activité :**
- Métier principal : liste déroulante (plombier, électricien, serrurier, chauffagiste) + option "Autre (précisez)" qui ouvre un champ texte libre
- Spécialités (facultatif) : système de tags libres — l'artisan tape et appuie sur Entrée. Des suggestions cliquables sont proposées mais il peut écrire ce qu'il veut
- Communes desservies : même système de tags libres, l'artisan tape ses communes une par une
- Description (facultatif) : textarea libre
- Photo/logo (facultatif) : zone d'upload
- Modes de contact : 3 cases à cocher
  - "Demande complète" (toujours activé, c'est le minimum)
  - "Message rapide" (l'artisan devra rappeler le client)
  - "Appel téléphonique direct" (le numéro sera visible)

**Étape 3 — Horaires d'ouverture (facultatif) :**
Ce sont les horaires GÉNÉRAUX de l'entreprise (quand elle est joignable), PAS les disponibilités pour les rendez-vous. Un encadré explique que les vraies disponibilités se gèrent depuis l'agenda du tableau de bord. Jours de la semaine avec toggle ouvert/fermé et champs horaires. Lundi-vendredi ouverts par défaut (7h30-18h00), samedi-dimanche fermés. Bouton "Passer cette étape" disponible.

**Étape 4 — Abonnement :**
- 2 cartes : mensuel (30 CHF/mois) et annuel (25 CHF/mois, recommandé, économie de 60 CHF)
- Les deux offrent les mêmes fonctionnalités
- Case à cocher CGU + politique de confidentialité
- Bouton "Créer mon profil et payer"

Pas de champs obligatoires marqués pour l'instant (à définir plus tard).

### 4.5 artisano-formulaire-demande.html
**Page de contact / demande — 3 modes au choix**

Le client arrive depuis le profil artisan. Il voit un en-tête avec le résumé de l'artisan, puis 3 cartes de choix :

**Option 1 — Appeler directement :**
Affiche le numéro en grand + bouton "Appeler maintenant" (lance l'appel sur mobile). Note : mentionner Artisano pour tracer la demande.
N'apparaît que si l'artisan a activé ce mode de contact.

**Option 2 — Message rapide :**
3 champs seulement : description du problème, prénom + téléphone, email. Bouton "Envoyer — l'artisan vous rappelle". Lien pour basculer vers le formulaire complet si besoin.
N'apparaît que si l'artisan a activé ce mode.

**Option 3 — Demande complète :**
Type (rendez-vous ou devis), coordonnées (prénom, nom, email, téléphone, adresse), description, photos (facultatif), créneau souhaité (facultatif). Toujours disponible.

Aucun compte client nécessaire. Le client donne ses coordonnées et c'est tout. Encadré qui le précise. Pas de durées estimées affichées.

### 4.6 artisano-connexion.html
**Page de connexion**

Deux onglets :

**"Je suis artisan" :**
- Email + mot de passe
- Lien "Mot de passe oublié ?"
- Bouton "Se connecter"
- Séparateur "ou"
- Bouton "Continuer avec Google"
- Lien "Pas encore inscrit ? Créer mon profil artisan"

**"Je suis client" :**
- Juste le champ email
- Bouton "Recevoir un lien de connexion" (magic link, pas de mot de passe)
- Encadré qui explique le fonctionnement (pas besoin de mot de passe, accès à l'historique des demandes)

### 4.7 artisano-laisser-avis.html
**Page pour laisser un avis vérifié (lien unique)**

Le client arrive via un lien reçu par email après l'intervention. Contient :
- Résumé de l'artisan (nom, métier, date d'intervention)
- 5 étoiles cliquables avec label dynamique (Très insatisfait → Très satisfait)
- Champ commentaire (facultatif) avec compteur de caractères
- Bouton "Publier mon avis"
- Badge en bas : "Cet avis sera marqué comme vérifié car l'intervention a été confirmée sur Artisano"

### 4.8 artisano-dashboard-artisan.html
**Tableau de bord artisan (espace connecté)**

Navigation avec onglets : Tableau de bord, Demandes, Mon profil, Agenda.

**Statistiques en haut :** nouvelles demandes, rendez-vous à venir, note moyenne, vues du profil.

**Deux onglets principaux :**

**Onglet "Demandes" :**
- Liste des dernières demandes avec statut (Nouvelle, Confirmée) et boutons Accepter/Voir
- Sidebar : derniers avis + carte abonnement (plan, statut actif, date renouvellement)

**Onglet "Agenda et disponibilités" :**
- Grille semaine interactive (colonnes = jours, lignes = heures de 8h à 17h)
- L'artisan CLIQUE sur les cases vides pour les marquer comme disponibles (vert)
- Il reclique pour retirer une disponibilité
- Les cases réservées par un client sont en orange et non modifiables
- Bouton "Publier les disponibilités" pour rendre les créneaux verts visibles sur le profil public
- Bouton "Connecter Google Calendar" (prévu pour la V2, présent mais non fonctionnel)
- Navigation semaine par semaine (boutons précédent/suivant)
- Légende : Disponible / Réservé / Non défini
- Encadré explicatif : "Cliquez sur les créneaux vides pour les marquer comme disponibles"

C'est CE système d'agenda qui alimente les disponibilités affichées sur le profil artisan et dans les résultats de recherche. Ce ne sont PAS des horaires d'ouverture généraux.

---

## 5. Logique métier importante

### Avis vérifiés
1. Le client envoie une demande via la plateforme
2. L'artisan accepte et confirme
3. L'intervention a lieu
4. L'artisan marque la demande comme terminée
5. Un email avec lien unique est envoyé au client
6. Le client note et commente
7. L'avis reçoit le badge "Avis vérifié"

Un seul avis par intervention. Lien valable une seule fois. Limite de temps (14-30 jours). Pas d'avis si annulation, refus, ou intervention hors plateforme.

### Modes de contact
L'artisan choisit à l'inscription quels modes activer :
- Demande complète (toujours activé)
- Message rapide (le client envoie un court message, l'artisan rappelle)
- Appel direct (le numéro est visible)

La page de contact côté client n'affiche que les options activées par l'artisan.

### Disponibilités
Les disponibilités sont gérées créneau par créneau depuis l'agenda du tableau de bord. L'artisan doit les mettre à jour régulièrement (chaque semaine ou chaque jour). Ce ne sont PAS des horaires d'ouverture généraux.

Les horaires d'ouverture (lundi-vendredi 7h30-18h00) sont une information distincte, affichée dans les coordonnées du profil.

### Compte client
Pas de compte obligatoire. Le client remplit ses coordonnées (prénom, email, téléphone) lors de la demande, comme quand on réserve une place de cinéma sans créer de compte. Il peut retrouver ses demandes via un magic link envoyé à son email.

### Abonnement artisan
- 30 CHF/mois (mensuel)
- 25 CHF/mois (annuel, soit 300 CHF/an)
- Pas de commission sur les demandes
- Résiliable à tout moment
- Paiement via Stripe

---

## 6. Cibles de lancement

- Zone : canton de Vaud (ou Genève, ou une zone urbaine précise)
- Métiers : plombier, électricien, serrurier, chauffagiste
- Objectif : 20 à 50 artisans au départ
- Extension progressive vers d'autres villes et métiers

---

## 7. Points à ne pas oublier

- Pas d'emoji nulle part, uniquement des icônes SVG
- Tout en toutes lettres (pas d'abréviations : "Disponible" pas "Dispo")
- Ton accessible et direct (tutoiement côté client)
- Responsive mobile sur toutes les pages
- Pas de section "artisans populaires" sur la homepage (pour ne pas décourager les nouveaux inscrits)
- Le SEO local est crucial (pages ville + métier bien structurées)
- Conformité nLPD : politique de confidentialité, CGU, mentions légales à créer
- La synchro Google Calendar est prévue pour la V2, le bouton est déjà dans le dashboard mais pas fonctionnel

---

## 8. Fonctionnalités V2 (pas dans le MVP)

- Synchro Google Calendar
- Badge artisan vérifié
- Réponse publique aux avis
- Classement par pertinence
- Mise en avant sponsorisée
- Application mobile
- Messagerie intégrée
- Statistiques détaillées pour les artisans
- Plusieurs utilisateurs par entreprise
- IA plus fine avec questions dynamiques

---

## 9. Ce qui reste à créer (pages non prototypées)

- Page de confirmation après envoi d'une demande
- Page "Comment ça marche" / landing page pour les artisans
- Pages légales (CGU, politique de confidentialité, mentions légales)
- Page d'erreur 404
- Panneau d'administration (gestion artisans, modération avis, statistiques)
