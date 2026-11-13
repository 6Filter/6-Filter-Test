/**
 * Part 140 E — the new-idea page: Upload / template link / import-review markup, wiring, and a narrow
 * screen layout (source-level, the way the other form CSS checks work).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const panel = read("../src/IdeaImportPanel.jsx");
const form = read("../src/PropositionForm.jsx");
const app = read("../src/App.jsx");

let checks = 0;
function check(name, fn) {
  try {
    fn();
    checks += 1;
  } catch (e) {
    e.message = `${name}: ${e.message}`;
    throw e;
  }
}

check("hero has the upload button, the template link and a file input for Excel, Word, PDF", () => {
  assert.match(panel, /Upload your idea \(Excel, Word or PDF\)/);
  assert.match(panel, /Download the Excel template/);
  assert.match(panel, /href=\{IMPORT_TEMPLATE_URL\}/);
  assert.match(panel, /IMPORT_TEMPLATE_URL = "\/api\/propositions\/import-template"/);
  assert.match(panel, /IMPORT_URL = "\/api\/propositions\/import"/);
  assert.match(panel, /type="file"/);
  assert.match(panel, /accept="[^"]*\.xlsx[^"]*\.docx?[^"]*\.pdf/);
  assert.match(panel, /data-testid="import-upload"/);
});

check("the panel sits in the hero, above the name box", () => {
  const hero = form.indexOf('id="the-proposition"');
  const panelAt = form.indexOf("<IdeaImportPanel", hero);
  const nameAt = form.indexOf('htmlFor="fld-name"', hero);
  assert.ok(hero > 0 && panelAt > hero && panelAt < nameAt, "panel is inside the hero before the first field");
  assert.match(form, /import IdeaImportPanel, \{ IDEA_IMPORT_CSS \} from "\.\/IdeaImportPanel\.jsx"/);
  assert.match(form, /\$\{IDEA_IMPORT_CSS\}/, "its CSS ships with the form CSS");
});

check("import-review shows counts and, per idea, filled / missing / warnings, Open draft and Submit", () => {
  assert.match(panel, /data-testid="import-review"/);
  assert.match(panel, /data-testid="import-count-created"/);
  assert.match(panel, /data-testid="import-count-rejected"/);
  assert.match(panel, /data-testid="import-idea"/);
  assert.match(panel, /boxes\b.*filled|filled/);
  assert.match(panel, /Still needed before Submit:/);
  assert.match(panel, /data-testid="import-warnings"/);
  assert.match(panel, />\s*Open draft\s*</);
  assert.match(panel, /data-testid="import-submit"/);
  assert.match(panel, /data-testid="import-open"/);
  assert.match(panel, /data-testid="import-rejected"/);
});

check("Submit all asks first, with the idea count and the list price", () => {
  assert.match(panel, /data-testid="import-submit-all"/);
  assert.match(panel, /window\.confirm\(submitAllConfirmText\(ready\.length\)\)/);
  assert.match(panel, /MEASURED_FRESH_IDEA/);
  assert.match(panel, /Estimated list price about \$/);
  assert.match(panel, /Submit \$\{count\} \$\{plural\(count, "idea", "ideas"\)\}\?/);
  // Ideas missing required boxes are not submitted in bulk, and one bad idea does not stop the rest.
  assert.match(panel, /!i\.missingRequired\?\.length/);
  assert.match(panel, /disabled=\{missing\.length > 0/);
});

check("a file over 5 MB is refused in the browser before it is sent", () => {
  assert.match(panel, /MAX_BYTES = 5 \* 1024 \* 1024/);
  assert.match(panel, /That file is over 5 MB/);
});

check("App wires open-draft, submit and keeps the review list across Open draft", () => {
  assert.match(app, /onOpenImportedDraft=\{openImportedDraft\}/);
  assert.match(app, /onSubmitImportedIdea=\{submitImportedIdea\}/);
  assert.match(app, /importResult=\{importResult\}/);
  assert.match(app, /key=\{formNonce\}/);
  assert.match(app, /remount: true/);
  assert.match(app, /putProposition\(id, full, normalizeProvider\(llmProvider\), \{\}\)/, "Submit goes through the normal save");
});

const cssStart = panel.indexOf("export const IDEA_IMPORT_CSS");
const css = panel.slice(cssStart);

check("narrow screens: actions stack, buttons fill the row, nothing scrolls sideways", () => {
  assert.match(css, /@media \(max-width:640px\)/);
  const narrow = css.slice(css.indexOf("@media"));
  assert.match(narrow, /\.import-actions-row\{[^}]*flex-direction:column/);
  assert.match(narrow, /\.import-upload-btn\{[^}]*width:100%/);
  assert.match(narrow, /min-height:44px/, "touch-sized buttons");
  assert.match(css, /\.import-actions-row\{[^}]*flex-wrap:wrap/);
  assert.match(css, /\.import-review\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.import-review\{[^}]*min-width:0/);
  assert.match(css, /\.import-idea-actions[^{]*\{[^}]*flex-wrap:wrap/);
  assert.ok(!/min-width:\s*[3-9]\d\dpx/.test(css), "no fixed wide minimum");
  assert.ok(!/white-space:\s*nowrap/.test(css), "text may wrap");
});

console.log(`testIdeaImportMobile: ${checks} checks passed`);
