/**
 * API Export Concepteur Pédagogique GWS
 * Auteur : Fabrice Faucheux
 * Version : 1.0.0
 */

/**
 * Point d'entrée pour les requêtes POST (Web App).
 * Reçoit le JSON du projet et orchestre la création du Doc.
 * * @param {Object} e - L'événement de la requête HTTP.
 * @return {GoogleAppsScript.Content.TextOutput} Réponse JSON contenant l'URL du doc ou une erreur.
 */
function doPost(e) {
  const output = { status: 'error', url: '', message: '' };
  
  try {
    // 1. Validation de l'entrée
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Aucune donnée reçue (Payload vide).");
    }

    const projectData = JSON.parse(e.postData.contents);
    
    // 2. Génération du document
    const docUrl = genererDocumentGoogle(projectData);
    
    output.status = 'success';
    output.url = docUrl;

  } catch (err) {
    console.error("Erreur doPost : " + err.toString());
    output.message = err.toString();
  }

  // 3. Retour de la réponse JSON (MIME Type correct pour éviter les erreurs CORS/Parsing)
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Crée et peuple le Google Doc à partir de l'objet JSON du projet.
 * * @param {Object} data - L'objet projet complet (issu de buildExportProjectData).
 * @return {string} L'URL du document créé.
 */
function genererDocumentGoogle(data) {
  const params = data.keyParams || {};
  const docName = `Plan de Cours - ${params.name || 'Sans titre'} - ${new Date().toLocaleDateString()}`;
  
  // Création du fichier à la racine du Drive (ou déplacer si besoin)
  const doc = DocumentApp.create(docName);
  const body = doc.getBody();

  // --- EN-TÊTE ---
  // Titre Principal
  body.insertParagraph(0, params.name || "Nouveau Cours")
      .setHeading(DocumentApp.ParagraphHeading.TITLE);
  
  // Métadonnées (Tableau invisible pour l'alignement ou texte simple)
  const metaSection = body.appendParagraph("");
  if (params.description) body.appendParagraph(params.description).setItalic(true);
  
  body.appendParagraph(`\nAuteur(s) : ${params.authors || 'Non spécifié'}`);
  body.appendParagraph(`Durée Cible : ${params.learningTimeVal || 0} ${params.learningTimeUnit || 'min'}`);
  body.appendParagraph(`Public Cible : ${params.targetAudience || 'Général'}`);
  
  body.appendHorizontalRule();

  // --- OBJECTIFS ---
  if (params.aims) {
    body.appendParagraph("Objectifs Généraux").setHeading(DocumentApp.ParagraphHeading.HEADING_1);
    body.appendParagraph(params.aims);
  }

  // --- DÉROULÉ PÉDAGOGIQUE ---
  body.appendParagraph("Déroulé Pédagogique").setHeading(DocumentApp.ParagraphHeading.HEADING_1);

  const activities = data.activities || [];

  if (activities.length === 0) {
    body.appendParagraph("Aucun module défini.");
  } else {
    // Itération sur les Modules
    activities.forEach((mod, modIdx) => {
      // Titre Module (H2)
      const modTitle = body.appendParagraph(`Module ${modIdx + 1} : ${mod.title}`);
      modTitle.setHeading(DocumentApp.ParagraphHeading.HEADING_2);
      modTitle.setForegroundColor("#1a73e8"); // Google Blue

      if (mod.description) {
        body.appendParagraph(mod.description).setIndentStart(20).setItalic(true);
      }

      const moments = mod.moments || [];
      
      // Itération sur les Moments
      moments.forEach((mom, momIdx) => {
        // Titre Moment (H3)
        const momTitle = body.appendParagraph(`Moment ${modIdx + 1}.${momIdx + 1} : ${mom.title}`);
        momTitle.setHeading(DocumentApp.ParagraphHeading.HEADING_3);
        
        const steps = mom.steps || [];
        
        if (steps.length > 0) {
          // Création d'un tableau pour les steps (plus propre qu'une liste)
          const table = body.appendTable();
          
          // En-tête du tableau
          const headerRow = table.appendTableRow();
          headerRow.appendTableCell("Activité").setBackgroundColor("#f3f6fc").setBold(true);
          headerRow.appendTableCell("Détails").setBackgroundColor("#f3f6fc").setBold(true);
          headerRow.appendTableCell("Durée").setBackgroundColor("#f3f6fc").setBold(true).setWidth(60);

          // Itération sur les Activités (Steps)
          steps.forEach(step => {
            const row = table.appendTableRow();
            
            // Cellule 1 : Titre + Type
            const cellTitle = row.appendTableCell();
            cellTitle.appendParagraph(step.title || "Sans titre").setBold(true);
            cellTitle.appendParagraph(`Type : ${step.type}`).setFontSize(8).setForegroundColor("#666666");
            if (step.gwsTool) {
               cellTitle.appendParagraph(`Outil : ${step.gwsTool.toUpperCase()}`).setFontSize(8).setForegroundColor("#ea4335"); // Google Red
            }

            // Cellule 2 : Tâches + Objectifs
            const cellDetails = row.appendTableCell();
            if (step.objective) cellDetails.appendParagraph(`Obj : ${step.objective}`).setItalic(true);
            if (step.tasks) cellDetails.appendParagraph(step.tasks);

            // Cellule 3 : Durée
            const cellTime = row.appendTableCell();
            cellTime.appendParagraph(`${step.duration} ${step.unit === '60' ? 'min' : 'h'}`);
          });
        }
      });
      // Espacement entre modules
      body.appendParagraph(""); 
    });
  }

  // Sauvegarde forcée
  doc.saveAndClose();
  return doc.getUrl();
}
