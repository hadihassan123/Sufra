(function () {

  const DOC_TYPES = [
    { key: 'cr', label: 'Commercial Registration', column: 'cr_document_path' },
    { key: 'moph', label: 'MOPH Food License', column: 'moph_document_path' },
    { key: 'municipality', label: 'Municipality Trade License', column: 'municipality_document_path' }
  ];

  async function render() {
    const list = document.getElementById('documentsList');

    list.innerHTML = DOC_TYPES.map(doc => {
      const path = DashboardState.currentVendor[doc.column];
      const uploaded = !!path;

      return `
        <div class="doc-card" data-doc="${doc.key}">
          <div class="doc-info">
            <h3>${doc.label}</h3>
            <p>${uploaded ? 'Uploaded — pending admin review' : 'Not uploaded yet'}</p>
          </div>

          <div class="doc-actions">
            <span class="doc-status-pill ${uploaded ? 'doc-status-uploaded' : 'doc-status-missing'}">
              ${uploaded ? 'Uploaded' : 'Missing'}
            </span>

            ${uploaded ? `<button class="btn btn-ghost btn-sm" data-view-doc="${doc.key}">View</button>` : ''}

            <label class="btn btn-teal btn-sm" style="margin:0;">
              ${uploaded ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                data-upload-doc="${doc.key}">
            </label>
          </div>
        </div>
      `;
    }).join('');
  }

  function init() {

    try {

      document.getElementById('documentsList').addEventListener('change', async (e) => {

        const input = e.target.closest('[data-upload-doc]');
        if (!input || !input.files[0]) return;

        const docType = input.dataset.uploadDoc;
        const file = input.files[0];

        if (file.size > 10 * 1024 * 1024) {
          alert('That file is over 10MB — please upload a smaller file.');
          return;
        }

        const card = input.closest('.doc-card');
        const label = card.querySelector('label.btn');
        const originalText = label.firstChild.textContent;

        label.firstChild.textContent = 'Uploading…';

        try {

          await Store.uploadVendorDocument(
            DashboardState.vendor.id,
            docType,
            file
          );

          DashboardState.setVendor(
            await Store.getVendorProfile(DashboardState.vendor.id)
          );

          render();

        } catch (err) {

          alert('Upload failed: ' + err.message);
          label.firstChild.textContent = originalText;

        }

      });

      document.getElementById('documentsList').addEventListener('click', async (e) => {

        const btn = e.target.closest('[data-view-doc]');
        if (!btn) return;

        const doc = DOC_TYPES.find(d => d.key === btn.dataset.viewDoc);

        const path = DashboardState.currentVendor[doc.column];

        if (!path) return;

        btn.disabled = true;

        try {

          const url = await Store.getVendorDocumentUrl(path);
          window.open(url, '_blank');

        } catch (err) {

          alert('Could not open document: ' + err.message);

        }

        btn.disabled = false;

      });

    } catch (err) {

      console.error('[verification documents] failed to wire up:', err);

    }

  }

  window.Documents = {
    init,
    render
  };

})();