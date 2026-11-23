import { useEffect, useRef, useState } from 'react';
import { useUI } from '../store';
import { Modal } from '../components/Overlays';
import { Icon } from '../components/Icon';
import { buildPlan, type ImportPlan, type PlanPage, type SourceFile } from './plan';
import { commitPlan, existingStructure, readDataTransfer, readFileList } from './importer';
import { db } from '../data/db';

type Step = 'pick' | 'reading' | 'preview' | 'importing' | 'done';

const countTree = (ps: PlanPage[]): number => ps.reduce((n, p) => n + 1 + countTree(p.children), 0);

export function ImportDialog() {
  const ui = useUI();
  const [step, setStep] = useState<Step>('pick');
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [stripRoot, setStripRoot] = useState(true);
  const [loose, setLoose] = useState('Imported');
  const [skipDup, setSkipDup] = useState(true);
  const [result, setResult] = useState<{ count: number; firstId?: string } | null>(null);
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!files.length) return;
    void existingStructure().then((ex) => setPlan(buildPlan(files, ex, { stripRoot, looseNotebook: loose.trim() || 'Imported' })));
  }, [files, stripRoot, loose]);

  const close = () => ui.set({ importOpen: false });
  const load = async (p: Promise<SourceFile[]>) => {
    setStep('reading'); setError(null);
    try {
      const got = await p;
      if (!got.some((f) => /\.(md|markdown|mdown)$/i.test(f.path))) { setError('No Markdown (.md) files found.'); setStep('pick'); return; }
      setFiles(got); setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read those files.'); setStep('pick');
    }
  };

  const doImport = async () => {
    if (!plan) return;
    setStep('importing');
    const r = await commitPlan(plan, { skipDuplicates: skipDup });
    setResult({ count: r.count, firstId: r.first?.id });
    setStep('done');
  };

  const openFirst = async () => {
    if (result?.firstId) {
      const p = await db.pages.get(result.firstId);
      const s = p && (await db.sections.get(p.section_id));
      if (p && s) { ui.set({ view: 'section' }); ui.openPage(p.id, { notebookId: s.notebook_id, sectionId: s.id }); }
    }
    close();
  };

  return (
    <Modal onClose={close} className="import">
      <div className="modal-head">
        <h3>Import Markdown</h3>
        <button className="icon-btn" aria-label="Close" onClick={close}><Icon name="x" /></button>
      </div>

      {(step === 'pick' || step === 'reading') && (
        <>
          <div className={`dropzone ${hover ? 'hover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setHover(true); }}
            onDragLeave={() => setHover(false)}
            onDrop={(e) => { e.preventDefault(); setHover(false); void load(readDataTransfer(e.dataTransfer)); }}>
            <Icon name="download" size={28} />
            <p><b>{step === 'reading' ? 'Reading files…' : 'Drop .md files, a folder, or a .zip here'}</b></p>
            <p className="muted small">Folders become notebooks, subfolders become sections, files become pages.</p>
            <div className="row gap">
              <button className="btn" onClick={() => filesRef.current?.click()}><Icon name="file" />Choose files or .zip</button>
              <button className="btn" onClick={() => folderRef.current?.click()}><Icon name="book" />Choose folder</button>
            </div>
          </div>
          {error && <p className="error">{error}</p>}
          <input ref={filesRef} type="file" hidden multiple accept=".md,.markdown,.mdown,.zip,text/markdown,application/zip"
            onChange={(e) => e.target.files && void load(readFileList(e.target.files))} />
          <input ref={folderRef} type="file" hidden multiple
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={(e) => e.target.files && void load(readFileList(e.target.files))} />
          <details className="help">
            <summary>How folders are mapped</summary>
            <ul>
              <li><code>Vault/LevelUp/Interviews/Jane.md</code> → notebook <b>LevelUp</b> › section <b>Interviews</b> › page <b>Jane</b></li>
              <li><code>Meeting.md</code> + a <code>Meeting/</code> folder → files in the folder become <b>subpages</b></li>
              <li>Front matter <code>title</code>, <code>tags</code>, <code>created</code>, <code>updated</code> and inline <code>#tags</code> are kept</li>
              <li>Existing notebooks and sections with the same name are merged</li>
            </ul>
          </details>
        </>
      )}

      {step === 'preview' && plan && (
        <>
          <div className="stats">
            <div><b>{plan.pageCount}</b><span>pages</span></div>
            <div><b>{plan.notebooks.length}</b><span>notebooks</span></div>
            <div><b>{plan.notebooks.reduce((n, nb) => n + nb.sections.length, 0)}</b><span>sections</span></div>
            {plan.duplicateCount > 0 && <div><b>{plan.duplicateCount}</b><span>duplicates</span></div>}
          </div>
          <div className="plan-tree">
            {plan.notebooks.map((nb) => (
              <div key={nb.name} className="plan-nb">
                <div className="plan-row"><Icon name="book" /><b>{nb.name}</b>{nb.existingId && <span className="pill">merge</span>}</div>
                {nb.sections.map((s) => (
                  <div key={s.name} className="plan-row sec">
                    <span className="dot" />{s.name}<span className="muted">{countTree(s.pages)} page{countTree(s.pages) === 1 ? '' : 's'}</span>
                    {s.existingId && <span className="pill">merge</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="options">
            {plan.hasCommonRoot && (
              <label className="check-label"><input type="checkbox" checked={stripRoot} onChange={(e) => setStripRoot(e.target.checked)} />
                Top folder is the collection (its subfolders become notebooks)</label>
            )}
            {plan.duplicateCount > 0 && (
              <label className="check-label"><input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
                Skip pages that already exist (same title in the same section)</label>
            )}
            <label className="field inline">Notebook for loose files
              <input className="input" value={loose} onChange={(e) => setLoose(e.target.value)} />
            </label>
          </div>
          {(plan.warnings.length > 0 || plan.skipped.length > 0) && (
            <details className="help warn">
              <summary>{plan.warnings.length + (plan.skipped.length ? 1 : 0)} note(s) about this import</summary>
              <ul>
                {plan.skipped.length > 0 && <li>{plan.skipped.length} non-Markdown file(s) skipped (images, PDFs…)</li>}
                {plan.warnings.slice(0, 50).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </details>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={() => { setFiles([]); setPlan(null); setStep('pick'); }}>Back</button>
            <button className="btn primary" onClick={doImport}>
              Import {plan.pageCount - (skipDup ? plan.duplicateCount : 0)} pages
            </button>
          </div>
        </>
      )}

      {step === 'importing' && <div className="dropzone"><p><b>Importing…</b></p></div>}

      {step === 'done' && result && (
        <div className="done">
          <div className="done-mark">✓</div>
          <p><b>Imported {result.count} page{result.count === 1 ? '' : 's'}.</b></p>
          <p className="muted small">They're saved on this device and will sync to your other devices.</p>
          <div className="modal-actions center">
            <button className="btn" onClick={close}>Close</button>
            {result.firstId && <button className="btn primary" onClick={openFirst}>Open notes</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
