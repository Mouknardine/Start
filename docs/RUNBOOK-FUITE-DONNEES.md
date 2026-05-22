# 🚨 Runbook — Violation de données personnelles (LPD)

> Document interne Artisano. À conserver à jour et accessible à tous les
> intervenants techniques ET au DPO.
>
> **Base légale** : Loi fédérale sur la protection des données (nLPD), entrée
> en vigueur le **1er septembre 2023**. Art. 24 nLPD impose la notification au
> PFPDT (Préposé fédéral à la protection des données et à la transparence)
> **dans les meilleurs délais**, et information des personnes concernées si
> nécessaire à leur protection ou exigée par le PFPDT.

---

## ⚡ Réaction immédiate (< 1 heure)

### Si tu détectes (ou suspectes) une fuite :

1. **NE PAS PANIQUER, NE PAS COMMUNIQUER PUBLIQUEMENT.**
2. **Documenter immédiatement** : prendre des screenshots, sauvegarder les
   logs Sentry/Supabase, noter heure exacte de détection.
3. **Contenir la fuite** :
   - Si fuite via service externe compromis → couper l'accès
   - Si fuite via code → déployer un patch immédiat
   - Si fuite via DB → activer immédiatement une RLS plus restrictive
4. **Évaluer le périmètre** :
   - Combien de personnes concernées ?
   - Quelles données (nom, email, téléphone, IBAN, etc.) ?
   - Pendant combien de temps la fuite a-t-elle été active ?
   - Source : intrusion, bug, erreur humaine ?

---

## 📞 Contacts d'urgence

| Rôle | Nom | Contact | Quand l'appeler |
|---|---|---|---|
| DPO / Responsable | [À COMPLÉTER] | [email/tel] | Toujours, en premier |
| Avocat data (LPD) | [À COMPLÉTER] | [tel] | Si fuite confirmée |
| PFPDT (Préposé) | Bureau officiel | +41 58 462 43 95 / [www.edoeb.admin.ch](https://www.edoeb.admin.ch/edoeb/fr/home/protection-des-donnees/annonce-d-une-violation-de-la-securite-des-donnees.html) | Notification obligatoire si risque élevé |
| Hébergeur Supabase | support@supabase.com | https://supabase.com/support | Si suspicion compromission infra |
| Hébergeur Vercel | https://vercel.com/help | — | Si suspicion infra |

---

## ⏱️ Délais légaux

| Étape | Délai | Référence |
|---|---|---|
| Documentation interne | Immédiat | nLPD art. 24 al. 4 |
| **Notification PFPDT** | **« Meilleurs délais »** (recommandé < 72h) | nLPD art. 24 al. 1 |
| Information des personnes concernées | Si nécessaire à leur protection | nLPD art. 24 al. 2 |

⚠️ **Attention** : la nLPD suisse ne fixe **pas** de délai strict de 72h (à la
différence du RGPD UE), mais le PFPDT considère que le délai des « meilleurs
délais » correspond en pratique à 72h. **Ne pas attendre.**

---

## 🔍 Procédure détaillée

### Phase 1 — Détection & confinement (T+0 à T+1h)

```
[ ] Identifier la nature de la fuite
[ ] Activer le confinement (rollback / patch / désactivation feature)
[ ] Bloquer l'accès aux comptes potentiellement compromis (Supabase Dashboard)
[ ] Faire un snapshot DB (pg_dump) AVANT toute modification corrective
[ ] Conserver les logs Sentry, logs Vercel, logs Supabase
```

### Phase 2 — Évaluation (T+1h à T+24h)

```
[ ] Recenser les données fuités
    - Combien d'utilisateurs ?
    - Quelles colonnes (email, tel, adresse, IBAN, photos, messages...) ?
    - Quelle profondeur (1 ligne ou la table entière) ?
[ ] Identifier le mode opératoire
    - Bug RLS / column-level grant ?
    - Token / clé service_role compromis ?
    - XSS / injection ?
    - Erreur humaine (admin a partagé un export) ?
[ ] Évaluer le RISQUE pour les personnes concernées :
    - LOW : email seul (déjà semi-public)
    - MEDIUM : email + tel + adresse
    - HIGH : IBAN, données médicales, mots de passe, données enfants
[ ] Rédiger une note d'analyse interne (timestamps, périmètre, risque)
```

### Phase 3 — Notification (T+24h à T+72h)

#### A. Notification PFPDT (toujours si risque MEDIUM/HIGH)

Site officiel : https://www.edoeb.admin.ch/edoeb/fr/home/protection-des-donnees/annonce-d-une-violation-de-la-securite-des-donnees.html

**Informations à fournir** (Art. 24 al. 2 OLPD) :
- Nature de la violation
- Catégories et nombre approximatif de personnes concernées
- Catégories et nombre approximatif de données concernées
- Conséquences probables
- Mesures prises pour remédier et atténuer
- Coordonnées du DPO ou du responsable

#### B. Notification des personnes concernées (si risque élevé)

Critères déclencheurs :
- Risque d'usurpation d'identité
- Risque financier (IBAN, mots de passe)
- Risque physique (adresse pour personnes vulnérables)
- Risque réputationnel (données sensibles révélées)

**Template d'email** (à personnaliser) :

```
Objet : Important — Incident de sécurité concernant votre compte Artisano

Bonjour,

Nous vous informons qu'un incident de sécurité a affecté la plateforme
Artisano le [DATE]. Les informations suivantes vous concernant ont pu
être consultées par un tiers non autorisé :

- [LISTE des données concernées]

Cette situation a été corrigée le [DATE]. Aucune action n'est requise
de votre part [OU : nous vous invitons à changer votre mot de passe / etc.].

Nous présentons nos sincères excuses pour cette situation. Le PFPDT a
été informé conformément à la loi.

Si vous avez des questions, contactez-nous à privacy@artisano.ch.

L'équipe Artisano
```

---

## 📋 Checklist post-incident

```
[ ] Patch déployé et vérifié
[ ] Notification PFPDT envoyée (numéro de référence reçu)
[ ] Personnes concernées informées (si critère atteint)
[ ] Audit log post-mortem rédigé et archivé
[ ] Tests automatisés ajoutés pour prévenir la récurrence
[ ] RLS / column-level grants revus
[ ] Si tokens compromis : rotation effectuée (Supabase service_role, etc.)
[ ] Service worker cache invalidé (bump VERSION dans /public/sw.js)
[ ] Communication publique sur le statut (si large impact)
[ ] Retour d'expérience documenté dans /docs/incidents/YYYY-MM-DD.md
```

---

## 🔐 Mesures préventives en place

À jour au **mai 2026** :

| Mesure | Statut | Référence |
|---|:-:|---|
| RLS Postgres sur toutes les tables sensibles | ✅ | migration `0001` |
| Column-level GRANT sur colonnes bancaires | ✅ | migration `0005` |
| Service role key tournée régulièrement | 🟡 manuel | `.env.local` |
| Validation Zod sur toutes les écritures | ✅ | `lib/validation/schemas.ts` |
| Rate limiting sur endpoints sensibles | ✅ | `lib/rate-limit.ts` |
| Headers de sécurité (CSP, HSTS, X-Frame-Options) | ✅ | `next.config.ts` |
| Vérification magic bytes uploads | ✅ | `lib/upload-security.ts` |
| Strip EXIF GPS | ✅ | `lib/upload-security.ts` |
| Logger centralisé + Sentry | ✅ | `lib/logger.ts` |
| Audit log immuable des actions admin | ✅ | migration `0003` |
| Suppression de compte complète (incl. auth + storage) | ✅ | `/api/account/delete` |
| Export RGPD (droit d'accès art. 25 nLPD) | ✅ | `/api/account/export` |
| Backup automatique DB | ❌ TODO | — |
| Audit pen-test externe | ❌ TODO | — |
| Pseudonymisation des logs | 🟡 partiel | logger.ts |

---

## 📚 Références

- **nLPD complète** : https://www.fedlex.admin.ch/eli/cc/2022/491/fr
- **OLPD (ordonnance d'application)** : https://www.fedlex.admin.ch/eli/cc/2022/568/fr
- **Guide PFPDT pour les responsables** : https://www.edoeb.admin.ch/edoeb/fr/home/protection-des-donnees/responsables-de-traitement.html
- **Formulaire annonce de violation** : https://databreach.edoeb.admin.ch

---

> Document maintenu par : [À COMPLÉTER]
> Dernière revue : 2026-05-15
> Prochaine revue obligatoire : tous les 6 mois OU après chaque incident
