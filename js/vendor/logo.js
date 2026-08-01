(function () {

  function render() {
    const preview = document.getElementById('logoPreview');
    const statusText = document.getElementById('logoStatusText');
    const btnText = document.getElementById('logoBtnText');
    const removeBtn = document.getElementById('removeLogoBtn');
    if(DashboardState.currentVendor.logo_url){
      preview.src = DashboardState.currentVendor.logo_url;
      preview.style.display = 'block';
      statusText.textContent = 'Shown next to your business name on listings.';
      btnText.textContent = 'Replace';
      removeBtn.style.display = 'inline-flex';
    } else {
      preview.style.display = 'none';
      statusText.textContent = 'Shown next to your business name on listings. Not uploaded yet.';
      btnText.textContent = 'Upload';
      removeBtn.style.display = 'none';
    }
  }

  function init() {
    try{
      render();

      document.getElementById('removeLogoBtn').addEventListener('click', async () => {
        if(!confirm('Remove your store logo?')) return;
        const removeBtn = document.getElementById('removeLogoBtn');
        removeBtn.disabled = true;
        try{
          await Store.removeVendorLogo(DashboardState.vendor.id);
          DashboardState.currentVendor = await Store.getVendorProfile(DashboardState.vendor.id);
          render();
        }catch(err){
          alert('Could not remove logo: ' + err.message);
        }
        removeBtn.disabled = false;
      });

      document.getElementById('logoInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        if(file.size > 2 * 1024 * 1024){
          alert('That file is over 2MB — please upload a smaller image.');
          return;
        }
        const btnText = document.getElementById('logoBtnText');
        const original = btnText.textContent;
        btnText.textContent = 'Uploading…';
        try{
          await Store.uploadVendorLogo(DashboardState.vendor.id, file);
          DashboardState.currentVendor = await Store.getVendorProfile(DashboardState.vendor.id);
          render();
        }catch(err){
          alert('Logo upload failed: ' + err.message);
          btnText.textContent = original;
        }
      });
    }catch(err){
      console.error('[store logo] failed to wire up:', err);
    }
  }

  window.Logo = { init, render };

})();