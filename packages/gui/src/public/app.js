/**
 * FALCON GUI — Client Controller & Connectivity Engine
 */

// Application State
const state = {
  activeTab: 'overview',
  currentRepo: null,
  files: [],
  selectedFile: null,
  graphData: null,
  selectedImpactFiles: new Set(),
  graphScale: 1,
  graphTranslate: { x: 0, y: 0 },
};

// ================= Toast Notifications =================
function showToast(message, duration = 3000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// ================= API Connectivity Helpers =================
async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
}

// ================= Initialization =================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupModals();
  setupFileEditor();
  setupImpactAnalysis();
  setupGraphControls();

  // Load initial status
  await fetchStatusAndInitialize();
});

async function fetchStatusAndInitialize() {
  try {
    const statusData = await apiFetch('/api/status');
    if (statusData.activeRepo) {
      updateRepositoryView(statusData.activeRepo);
    } else {
      // Auto-ingest current local workspace as default
      await ingestLocalDirectory('.');
    }
  } catch {
    showToast('Connecting to Falcon GUI Server...');
  }
}

// ================= Tab Navigation =================
function setupNavigation() {
  const tabs = document.querySelectorAll('.segment-btn');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      setActiveTab(targetTab);
    });
  });
}

function setActiveTab(tabId) {
  state.activeTab = tabId;

  document.querySelectorAll('.segment-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  document.querySelectorAll('.tab-pane').forEach((pane) => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });

  if (tabId === 'graph') {
    renderGraph();
  }
}

// ================= Repository View & Stats =================
function updateRepositoryView(repo) {
  state.currentRepo = repo;
  state.files = repo.inventory.files || [];

  // Update header badges
  document.getElementById('currentRepoLabel').textContent = repo.name;
  document.getElementById('currentBranchLabel').textContent = repo.branch || 'main';

  // Hero section
  document.getElementById('heroSourceTag').textContent =
    repo.source === 'github' ? 'GITHUB REPOSITORY' : 'LOCAL WORKSPACE';
  document.getElementById('heroRepoName').textContent = repo.name;
  document.getElementById('heroRepoPath').textContent = repo.rootPath;
  document.getElementById('heroCommitSha').textContent = repo.commitSha || 'draft';
  document.getElementById('heroBranchName').textContent = repo.branch || 'main';
  document.getElementById('heroIngestTime').textContent = new Date(repo.ingestedAt).toLocaleTimeString();

  // Metrics
  document.getElementById('statSourceFiles').textContent = state.files.length;
  document.getElementById('statTotalScanned').textContent = `from ${repo.inventory.totalFilesScanned || state.files.length} scanned`;
  document.getElementById('statGraphNodes').textContent = repo.totalNodes || state.files.length;
  document.getElementById('statGraphEdges').textContent = repo.totalEdges || 0;

  // Language Breakdown
  renderLanguageBreakdown(state.files);

  // Diagnostics
  renderDiagnostics(repo.inventory.diagnostics || []);

  // File tree
  renderFileTree();

  // Populate impact file picker
  renderImpactFilePicker();

  // Fetch graph data
  loadGraphData();
}

function renderLanguageBreakdown(files) {
  const counts = {};
  for (const f of files) {
    counts[f.language] = (counts[f.language] || 0) + 1;
  }

  const bar = document.getElementById('langBarContainer');
  const legend = document.getElementById('langLegendContainer');
  bar.innerHTML = '';
  legend.innerHTML = '';

  const total = files.length || 1;
  const colors = {
    typescript: '#0a84ff',
    javascript: '#ffd60a',
    tsx: '#30d158',
    jsx: '#ff9f0a',
  };

  for (const [lang, count] of Object.entries(counts)) {
    const pct = ((count / total) * 100).toFixed(1);
    const color = colors[lang] || '#bf5af2';

    const segment = document.createElement('div');
    segment.className = 'lang-segment';
    segment.style.width = `${pct}%`;
    segment.style.backgroundColor = color;
    segment.title = `${lang}: ${count} (${pct}%)`;
    bar.appendChild(segment);

    const leg = document.createElement('div');
    leg.className = 'legend-item';
    leg.innerHTML = `<span class="legend-dot" style="background:${color}"></span>${lang} (${count})`;
    legend.appendChild(leg);
  }
}

function renderDiagnostics(diagnostics) {
  const container = document.getElementById('diagnosticsList');
  container.innerHTML = '';

  if (!diagnostics || diagnostics.length === 0) {
    container.innerHTML = '<div class="empty-state">No diagnostics or violations reported. Clean workspace.</div>';
    document.getElementById('statCycleStatus').textContent = 'Clean';
    document.getElementById('statCycleStatus').style.color = '#30d158';
    return;
  }

  diagnostics.forEach((diag) => {
    const div = document.createElement('div');
    div.className = 'diag-item';
    div.innerHTML = `
      <span>[${diag.severity.toUpperCase()}] ${diag.message}</span>
      <span class="diag-code">${diag.code}</span>
    `;
    container.appendChild(div);
  });
}

// ================= File Tree & Code Editor =================
function setupFileEditor() {
  const searchInput = document.getElementById('fileSearchInput');
  searchInput.addEventListener('input', () => {
    renderFileTree(searchInput.value.trim().toLowerCase());
  });

  const textarea = document.getElementById('editorTextarea');
  textarea.addEventListener('input', updateLineNumbers);
  textarea.addEventListener('scroll', () => {
    document.getElementById('editorLineNumbers').scrollTop = textarea.scrollTop;
  });

  document.getElementById('btnSaveFile').addEventListener('click', saveCurrentFile);

  // Find & Replace
  const frBar = document.getElementById('findReplaceBar');
  document.getElementById('btnFindReplace').addEventListener('click', () => {
    frBar.classList.toggle('hidden');
    if (!frBar.classList.contains('hidden')) {
      document.getElementById('inputFind').focus();
    }
  });

  document.getElementById('btnCloseFindReplace').addEventListener('click', () => {
    frBar.classList.add('hidden');
  });

  document.getElementById('btnApplyReplace').addEventListener('click', applyFindReplace);
}

function renderFileTree(filter = '') {
  const container = document.getElementById('fileTreeContainer');
  container.innerHTML = '';

  const filtered = filter
    ? state.files.filter((f) => f.relativePath.toLowerCase().includes(filter))
    : state.files;

  document.getElementById('fileTreeCount').textContent = `${filtered.length} files`;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">No matching source files.</div>';
    return;
  }

  filtered.forEach((file) => {
    const item = document.createElement('div');
    item.className = `tree-file-item ${state.selectedFile === file.relativePath ? 'active' : ''}`;
    item.innerHTML = `
      <span class="tree-file-name" title="${file.relativePath}">${file.relativePath}</span>
      <span class="tree-file-badge">${file.language}</span>
    `;
    item.addEventListener('click', () => selectFile(file.relativePath));
    container.appendChild(item);
  });
}

async function selectFile(relativePath) {
  state.selectedFile = relativePath;
  renderFileTree(document.getElementById('fileSearchInput').value.trim().toLowerCase());

  document.getElementById('editorFilePath').textContent = relativePath;

  try {
    const data = await apiFetch(`/api/repository/file?path=${encodeURIComponent(relativePath)}`);
    const textarea = document.getElementById('editorTextarea');
    textarea.value = data.content;
    document.getElementById('editorLangBadge').textContent = data.language;
    document.getElementById('editorHashBadge').textContent = data.contentHash.slice(0, 10);
    updateLineNumbers();
  } catch (err) {
    showToast(`Failed to read file: ${err.message}`);
  }
}

function updateLineNumbers() {
  const textarea = document.getElementById('editorTextarea');
  const lineCount = (textarea.value.match(/\n/g) || []).length + 1;
  const numbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
  document.getElementById('editorLineNumbers').innerText = numbers;
}

async function saveCurrentFile() {
  if (!state.selectedFile) {
    showToast('No file selected to save.');
    return;
  }

  const content = document.getElementById('editorTextarea').value;
  try {
    const res = await apiFetch('/api/repository/file/edit', {
      method: 'POST',
      body: JSON.stringify({
        path: state.selectedFile,
        content,
      }),
    });

    if (res.success && res.updated) {
      document.getElementById('editorHashBadge').textContent = res.updated.contentHash.slice(0, 10);
      showToast(`Saved changes to ${state.selectedFile}`);
    }
  } catch (err) {
    showToast(`Error saving file: ${err.message}`);
  }
}

async function applyFindReplace() {
  if (!state.selectedFile) return;

  const find = document.getElementById('inputFind').value;
  const replace = document.getElementById('inputReplace').value;

  if (!find) {
    showToast('Enter text or pattern to find.');
    return;
  }

  try {
    const res = await apiFetch('/api/repository/file/edit', {
      method: 'POST',
      body: JSON.stringify({
        path: state.selectedFile,
        find,
        replace,
      }),
    });

    if (res.success) {
      showToast(`Replaced ${res.edited.replacementsCount} occurrence(s)`);
      // Reload editor
      await selectFile(state.selectedFile);
    }
  } catch (err) {
    showToast(`Replace failed: ${err.message}`);
  }
}

// ================= Dependency Graph Visualizer =================
async function loadGraphData() {
  try {
    const data = await apiFetch('/api/graph');
    state.graphData = data;
    document.getElementById('graphNodesBadge').textContent = `Nodes: ${data.nodes.length}`;
    document.getElementById('graphEdgesBadge').textContent = `Edges: ${data.edges.length}`;
    document.getElementById('graphCycleBadge').textContent = data.hasCycle ? 'Cycle Detected' : 'Acyclic';
    if (data.hasCycle) {
      document.getElementById('graphCycleBadge').style.color = '#ff453a';
      document.getElementById('statCycleStatus').textContent = 'Warning';
      document.getElementById('statCycleStatus').style.color = '#ff9f0a';
      document.getElementById('statCyclesCount').textContent = `${data.cyclesCount} cycles detected`;
    }
    if (state.activeTab === 'graph') {
      renderGraph();
    }
  } catch {
    // Ignore if graph not ready
  }
}

function setupGraphControls() {
  document.getElementById('btnZoomIn').addEventListener('click', () => {
    state.graphScale = Math.min(state.graphScale * 1.25, 3);
    applyGraphTransform();
  });

  document.getElementById('btnZoomOut').addEventListener('click', () => {
    state.graphScale = Math.max(state.graphScale * 0.8, 0.3);
    applyGraphTransform();
  });

  document.getElementById('btnResetGraph').addEventListener('click', () => {
    state.graphScale = 1;
    state.graphTranslate = { x: 0, y: 0 };
    applyGraphTransform();
  });
}

function applyGraphTransform() {
  const g = document.getElementById('graphGroup');
  if (g) {
    g.setAttribute(
      'transform',
      `translate(${state.graphTranslate.x}, ${state.graphTranslate.y}) scale(${state.graphScale})`,
    );
  }
}

function renderGraph() {
  if (!state.graphData) return;

  const svg = document.getElementById('dependencyGraphSvg');
  svg.innerHTML = '';

  const width = svg.clientWidth || 900;
  const height = svg.clientHeight || 600;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.id = 'graphGroup';
  svg.appendChild(g);

  const nodes = state.graphData.nodes.slice(0, 60); // Cap at 60 for clean rendering
  const nodeMap = new Map();

  // Circular layout distribution
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(centerX, centerY) * 0.75;

  nodes.forEach((node, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    nodeMap.set(node.id, { ...node, x, y });
  });

  // Render edges
  const edges = state.graphData.edges;
  edges.forEach((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) return;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${sourceNode.x} ${sourceNode.y} Q ${(sourceNode.x + targetNode.x) / 2 + 20} ${(sourceNode.y + targetNode.y) / 2} ${targetNode.x} ${targetNode.y}`;
    path.setAttribute('d', d);
    path.setAttribute('class', 'graph-edge');
    g.appendChild(path);
  });

  // Render nodes
  nodeMap.forEach((node) => {
    const nodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodeG.setAttribute('class', `graph-node ${node.kind}`);
    nodeG.setAttribute('transform', `translate(${node.x}, ${node.y})`);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', node.kind === 'file' ? '9' : '6');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '12');
    text.setAttribute('y', '4');
    const label = node.label.split('/').pop() || node.label;
    text.textContent = label.length > 20 ? label.slice(0, 18) + '...' : label;

    nodeG.appendChild(circle);
    nodeG.appendChild(text);

    // Hover tooltip
    nodeG.addEventListener('mouseenter', (e) => {
      const tip = document.getElementById('graphTooltip');
      tip.style.display = 'block';
      tip.style.left = `${e.clientX + 10}px`;
      tip.style.top = `${e.clientY - 30}px`;
      tip.innerHTML = `<strong>${node.label}</strong><br>Type: ${node.kind}`;
    });

    nodeG.addEventListener('mouseleave', () => {
      document.getElementById('graphTooltip').style.display = 'none';
    });

    // Click to select file in editor
    if (node.filePath) {
      nodeG.addEventListener('click', () => {
        setActiveTab('files');
        selectFile(node.filePath);
      });
    }

    g.appendChild(nodeG);
  });

  applyGraphTransform();
}

// ================= Impact Analysis Suite =================
function setupImpactAnalysis() {
  document.getElementById('btnRunImpactAnalysis').addEventListener('click', runImpactTraversal);
}

function renderImpactFilePicker() {
  const container = document.getElementById('impactFilePicker');
  container.innerHTML = '';

  state.files.forEach((file) => {
    const chip = document.createElement('button');
    chip.className = `file-chip ${state.selectedImpactFiles.has(file.relativePath) ? 'selected' : ''}`;
    chip.textContent = file.relativePath;
    chip.addEventListener('click', () => {
      if (state.selectedImpactFiles.has(file.relativePath)) {
        state.selectedImpactFiles.delete(file.relativePath);
        chip.classList.remove('selected');
      } else {
        state.selectedImpactFiles.add(file.relativePath);
        chip.classList.add('selected');
      }
    });
    container.appendChild(chip);
  });
}

async function runImpactTraversal() {
  const changedFiles = Array.from(state.selectedImpactFiles);
  if (changedFiles.length === 0) {
    showToast('Please select at least one file to simulate change.');
    return;
  }

  const maxDepth = parseInt(document.getElementById('inputMaxDepth').value, 10) || 5;

  try {
    showToast('Calculating impact reachability traversal...');
    const report = await apiFetch('/api/impact/analyze', {
      method: 'POST',
      body: JSON.stringify({
        changedFiles,
        maxDepth,
      }),
    });

    renderImpactResults(report);
  } catch (err) {
    showToast(`Impact analysis failed: ${err.message}`);
  }
}

function renderImpactResults(report) {
  const container = document.getElementById('impactResultsContainer');
  container.innerHTML = '';

  const { directlyAffectedFiles, transitivelyAffectedFiles, findings } = report;
  const stats = report.statistics || report.stats || { maxDepthReached: 1 };

  // Summary Cards
  const summaryGrid = document.createElement('div');
  summaryGrid.className = 'impact-summary-grid';
  summaryGrid.innerHTML = `
    <div class="glass-card stat-card impact-card-highlight">
      <span class="stat-caption">Directly Affected Files</span>
      <div class="stat-value" style="color:var(--accent-red)">${directlyAffectedFiles.length}</div>
      <span class="stat-trend">1-hop immediate dependents</span>
    </div>
    <div class="glass-card stat-card impact-card-transitive">
      <span class="stat-caption">Transitive Dependents</span>
      <div class="stat-value" style="color:var(--accent-orange)">${transitivelyAffectedFiles.length}</div>
      <span class="stat-trend">Reachable propagation reach</span>
    </div>
    <div class="glass-card stat-card">
      <span class="stat-caption">Total Findings</span>
      <div class="stat-value">${findings.length}</div>
      <span class="stat-trend info">Max depth: ${stats.maxDepthReached} hops</span>
    </div>
  `;
  container.appendChild(summaryGrid);

  // Directly Affected Files Section
  const directCard = document.createElement('div');
  directCard.className = 'glass-card';
  directCard.innerHTML = `<h3 class="card-heading">Directly Affected Files (${directlyAffectedFiles.length})</h3>`;
  const directList = document.createElement('div');
  directList.className = 'affected-list';

  if (directlyAffectedFiles.length === 0) {
    directList.innerHTML = '<div class="empty-state">No immediate 1-hop dependent files.</div>';
  } else {
    directlyAffectedFiles.forEach((f) => {
      const row = document.createElement('div');
      row.className = 'affected-file-row';
      row.innerHTML = `
        <span class="affected-file-path">${f.filePath}</span>
        <span class="confidence-tag ${f.aggregatedConfidence}">${f.aggregatedConfidence}</span>
      `;
      directList.appendChild(row);
    });
  }
  directCard.appendChild(directList);
  container.appendChild(directCard);

  // Shortest Impact Paths Section
  const pathCard = document.createElement('div');
  pathCard.className = 'glass-card';
  pathCard.innerHTML = `<h3 class="card-heading">Impact Propagation Paths (${findings.length})</h3>`;

  findings.slice(0, 10).forEach((finding) => {
    const item = document.createElement('div');
    item.className = 'impact-path-item';
    item.innerHTML = `
      <div class="path-trace">${finding.path.join(' ➔ ')}</div>
      <div class="path-reason">Kind: <strong>${finding.impactKind}</strong> | Reason: ${finding.reason} | Confidence: ${finding.confidence}</div>
    `;
    pathCard.appendChild(item);
  });

  if (findings.length > 10) {
    const more = document.createElement('div');
    more.className = 'empty-state';
    more.textContent = `... and ${findings.length - 10} more impact paths`;
    pathCard.appendChild(more);
  }

  container.appendChild(pathCard);

  // Recommended Tests Section
  if (report.testRecommendations) {
    const testCard = document.createElement('div');
    testCard.className = 'glass-card';
    const recs = report.testRecommendations.recommendedTests || [];
    testCard.innerHTML = `<h3 class="card-heading">🎯 Recommended Tests (${recs.length})</h3>`;

    const testList = document.createElement('div');
    testList.className = 'affected-list';

    if (recs.length === 0) {
      testList.innerHTML = '<div class="empty-state">No test recommendations found.</div>';
    } else {
      recs.forEach((t) => {
        const item = document.createElement('div');
        item.className = 'impact-path-item';
        item.style.marginBottom = '8px';
        item.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${t.testFile}</strong>
            <span class="confidence-tag ${t.confidence}">[${t.confidence}] ${t.evidenceLevel}</span>
          </div>
          <div class="path-reason" style="margin-top:4px;">
            Target: <code>${t.targetChangedFile}</code> | Distance: ${t.distance} hops<br/>
            ${t.reason}
          </div>
        `;
        testList.appendChild(item);
      });
    }

    if (report.testRecommendations.missingMappings && report.testRecommendations.missingMappings.length > 0) {
      const missingWarn = document.createElement('div');
      missingWarn.className = 'empty-state';
      missingWarn.style.color = 'var(--accent-orange)';
      missingWarn.style.marginTop = '8px';
      missingWarn.innerHTML = `⚠️ <strong>Missing Test Mappings:</strong> ${report.testRecommendations.missingMappings.join(', ')}`;
      testList.appendChild(missingWarn);
    }

    testCard.appendChild(testList);
    container.appendChild(testCard);
  }
}

// ================= Ingestion Modals =================
function setupModals() {
  const ghModal = document.getElementById('githubModal');
  const localModal = document.getElementById('localModal');

  document.getElementById('btnOpenGithubModal').addEventListener('click', () => {
    ghModal.classList.remove('hidden');
    document.getElementById('inputGithubUrl').focus();
  });

  document.getElementById('btnCloseGithubModal').addEventListener('click', () => {
    ghModal.classList.add('hidden');
  });

  document.getElementById('btnCancelGithub').addEventListener('click', () => {
    ghModal.classList.add('hidden');
  });

  document.getElementById('btnOpenLocalModal').addEventListener('click', () => {
    localModal.classList.remove('hidden');
    document.getElementById('inputLocalPath').focus();
  });

  document.getElementById('btnCloseLocalModal').addEventListener('click', () => {
    localModal.classList.add('hidden');
  });

  document.getElementById('btnCancelLocal').addEventListener('click', () => {
    localModal.classList.add('hidden');
  });

  // Presets
  document.querySelectorAll('.preset-pill-group .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.url) {
        document.getElementById('inputGithubUrl').value = btn.dataset.url;
      }
    });
  });

  document.getElementById('btnPresetFalconRoot').addEventListener('click', () => {
    document.getElementById('inputLocalPath').value = '.';
  });

  // Submit GitHub Ingest
  document.getElementById('btnSubmitGithub').addEventListener('click', submitGithubIngest);

  // Submit Local Ingest
  document.getElementById('btnSubmitLocal').addEventListener('click', async () => {
    const pathVal = document.getElementById('inputLocalPath').value.trim() || '.';
    localModal.classList.add('hidden');
    await ingestLocalDirectory(pathVal);
  });

  document.getElementById('btnRefreshScan').addEventListener('click', async () => {
    if (state.currentRepo) {
      await ingestLocalDirectory(state.currentRepo.rootPath);
    }
  });
}

async function submitGithubIngest() {
  const url = document.getElementById('inputGithubUrl').value.trim();
  const branch = document.getElementById('inputGithubBranch').value.trim() || undefined;
  const depth = parseInt(document.getElementById('selectGithubDepth').value, 10) || 1;

  if (!url) {
    showToast('Enter a GitHub repository URL or shorthand.');
    return;
  }

  const progress = document.getElementById('ingestProgressContainer');
  const statusText = document.getElementById('ingestStepStatus');
  const submitBtn = document.getElementById('btnSubmitGithub');
  const btnText = document.getElementById('btnSubmitGithubText');

  progress.classList.remove('hidden');
  statusText.textContent = `Validating and cloning ${url} (depth ${depth})...`;
  submitBtn.disabled = true;
  btnText.textContent = 'Cloning...';

  try {
    const res = await apiFetch('/api/ingest/github', {
      method: 'POST',
      body: JSON.stringify({ url, branch, depth }),
    });

    if (res.success && res.repo) {
      statusText.textContent = 'Ingestion complete! Building graph...';
      updateRepositoryView(res.repo);
      showToast(`Successfully ingested ${res.repo.name}`);
      document.getElementById('githubModal').classList.add('hidden');
    }
  } catch (err) {
    showToast(`GitHub Ingestion Failed: ${err.message}`);
    statusText.textContent = `Error: ${err.message}`;
  } finally {
    submitBtn.disabled = false;
    btnText.textContent = 'Start Ingestion';
    progress.classList.add('hidden');
  }
}

async function ingestLocalDirectory(pathVal) {
  showToast(`Scanning directory: ${pathVal}...`);
  try {
    const res = await apiFetch('/api/ingest/local', {
      method: 'POST',
      body: JSON.stringify({ path: pathVal }),
    });

    if (res.success && res.repo) {
      updateRepositoryView(res.repo);
      showToast(`Ingested ${res.repo.name} (${res.repo.inventory.files.length} files)`);
    }
  } catch (err) {
    showToast(`Ingest failed: ${err.message}`);
  }
}
