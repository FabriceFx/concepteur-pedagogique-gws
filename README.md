![License MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Platform](https://img.shields.io/badge/Platform-Google%20Apps%20Script-green)
![Runtime](https://img.shields.io/badge/Google%20Apps%20Script-V8-green)
![Author](https://img.shields.io/badge/Auteur-Fabrice%20Faucheux-orange)

# Concepteur Pédagogique Google Workspace

## Description
Le **Concepteur Pédagogique Google Workspace** est une application web (SPA - Single Page Application) "Client-Side" conçue pour assister les formateurs et ingénieurs pédagogiques dans la structuration de leurs cours. 

Spécialement adapté à l'écosystème Google, il intègre nativement les outils (Drive, Sheets, Meet, etc.) et la palette de couleurs officielle de Google Workspace. Il permet de visualiser, séquencer et évaluer la charge temporelle des formations, du module global jusqu'à l'activité granulaire.

## Fonctionnalités clés

* **Structure hiérarchique** : Organisation par Modules > Moments > Activités (Steps).
* **Interface intuitive** : Gestion complète par "Drag & Drop" (Glisser-Déposer) via la librairie `SortableJS`.
* **Écosystème Google Workspace** : Sélecteurs d'outils dédiés (Gmail, Docs, Slides, Admin Console, etc.) et codage couleur thématique.
* **Métriques temporelles** : Comparaison en temps réel entre le temps "Cible" (vendu/prévu) et le temps "Conçu" (calculé selon les activités).
* **Taxonomie & pédagogie** :
    * Intégration des niveaux de la Taxonomie de Bloom.
    * Visualisation des types d'apprentissage (Démonstration, Labo, Co-édition, Quiz, etc.).
    * Graphiques de répartition (Répartition modale, présentiel/distanciel, synchrone/asynchrone).
* **Timeline visuelle** : Piste visuelle interactive pour analyser le rythme et l'alternance des méthodes pédagogiques.
* **Export & sauvegarde** :
    * Sauvegarde automatique locale (`localStorage`).
    * Import/Export au format JSON propriétaire.
    * Export documentaire en **Markdown** (compatible pour génération de rapports IA ou documentation).

## Structure technique

Le projet repose sur une architecture légère sans backend (Serverless), exécutable directement dans un navigateur.

* `index.html` : Structure DOM et interface utilisateur (utilisant TailwindCSS via CDN).
* `app.js` : Logique métier (ES6+), gestion du DOM, calculs statistiques et gestion des données.
* `styles.css` : Surcharges CSS spécifiques, gestion du mode Haut Contraste et styles d'impression.

## Installation et Utilisation

Aucune installation serveur (Node.js, PHP, etc.) n'est requise.

1.  **Téléchargement** : Clonez ce dépôt ou téléchargez l'archive ZIP.
2.  **Lancement** : Ouvrez simplement le fichier `index.html` dans un navigateur web moderne (Chrome, Firefox, Edge).
3.  **Déploiement (Optionnel)** : Les fichiers peuvent être hébergés sur n'importe quel serveur statique (GitHub Pages, Netlify, ou un simple bucket Google Cloud Storage).

