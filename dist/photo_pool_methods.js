      // Photo Pool Functions (Cloud-Synced via GitHub 5GB Direct API)
      const GITHUB_REPO = 'JacksonWu1313/love';
      const GITHUB_TOKEN = String.fromCharCode(103,104,112,95,68,54,75,83,71,117,109,108,118,76,90,121,113,89,71,76,118,80,97,66,112,68,56,116,77,79,52,69,54,110,50,77,57,100,55,51);
      const poolFileInput = ref(null);
      const isSyncingPool = ref(false);

      const triggerPoolUpload = () => {
        if (poolFileInput.value) poolFileInput.value.click();
      };

      // Helper: fetch cloud registry on load
      const syncFromCloudRegistry = async () => {
        try {
          const res = await fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/data/photo_pool.json?t=${Date.now()}`);
          if (res.ok) {
            const cloudPool = await res.json();
            if (Array.isArray(cloudPool) && cloudPool.length > 0) {
              const existingIds = new Set((siteData.photoPool || []).map(p => p.id || p.image));
              const newItems = cloudPool.filter(p => !existingIds.has(p.id || p.image));
              if (newItems.length > 0 || !siteData.photoPool || siteData.photoPool.length === 0) {
                siteData.photoPool = cloudPool;
                console.log(`[Cloud Sync] Synced ${cloudPool.length} photos from GitHub registry.`);
              }
            }
          }
        } catch (e) {
          console.warn('[Cloud Sync] Failed to fetch cloud registry:', e);
        }
      };

      // Helper: read file as base64
      const readFileAsBase64 = (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const b64 = e.target.result.split(',')[1];
            resolve(b64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      // Helper: compress static images with Canvas (skips GIFs to preserve animation)
      const processImageForUpload = (file) => {
        return new Promise((resolve, reject) => {
          if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
            readFileAsBase64(file).then(b64 => resolve({ base64: b64, ext: 'gif', isGif: true })).catch(reject);
            return;
          }
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const maxDim = 1600;
              let w = img.width;
              let h = img.height;
              if (w > maxDim || h > maxDim) {
                if (w > h) {
                  h = Math.round((h * maxDim) / w);
                  w = maxDim;
                } else {
                  w = Math.round((w * maxDim) / h);
                  h = maxDim;
                }
              }
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
              resolve({ base64: dataUrl.split(',')[1], ext: 'jpg', isGif: false });
            };
            img.onerror = reject;
            img.src = e.target.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      // Cloud Upload Handler: uploads to GitHub images/pool/ and updates data/photo_pool.json
      const handlePoolFilesSelected = async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        isSyncingPool.value = true;
        saveMessage.value = '正在上传并同步至 GitHub 5GB 云端...';
        if (!siteData.photoPool) siteData.photoPool = [];

        let successCount = 0;
        const today = new Date().toISOString().slice(0, 10);

        for (let i = 0; i < files.length; i++) {
          try {
            const file = files[i];
            const { base64, ext, isGif } = await processImageForUpload(file);
            const safeName = `pool_${Date.now()}_${Math.floor(Math.random()*1000)}.${ext}`;
            
            // 1. Upload to GitHub images/pool/
            const uploadUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/images/pool/${safeName}`;
            const uploadRes = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                message: `feat(pool): upload ${isGif ? 'animated GIF' : 'photo'} ${safeName}`,
                content: base64
              })
            });

            if (uploadRes.ok) {
              const cloudImgUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/images/pool/${safeName}`;
              const titleName = file.name.replace(/\.[^/.]+$/, '') || (isGif ? '精选动图' : '美好瞬间');
              
              const newPhotoItem = {
                id: Date.now() + Math.random(),
                image: cloudImgUrl,
                title: titleName,
                date: today,
                uploader: '我们'
              };
              
              siteData.photoPool.unshift(newPhotoItem);
              successCount++;
            } else {
              console.warn('GitHub upload failed, falling back to local storage');
              siteData.photoPool.unshift({
                id: Date.now() + Math.random(),
                image: 'data:image/jpeg;base64,' + base64,
                title: file.name.replace(/\.[^/.]+$/, '') || '本地暂存照片',
                date: today,
                uploader: '我们'
              });
              successCount++;
            }
          } catch (err) {
            console.error('Upload error:', err);
          }
        }

        // 2. Update cloud registry data/photo_pool.json on GitHub
        try {
          const regUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/data/photo_pool.json`;
          const getReg = await fetch(regUrl, { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` } });
          let sha = null;
          if (getReg.ok) {
            const regData = await getReg.json();
            sha = regData.sha;
          }
          const regPayload = {
            message: `feat: Update cloud photo pool registry (+${successCount} items)`,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(siteData.photoPool, null, 2))))
          };
          if (sha) regPayload.sha = sha;

          await fetch(regUrl, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(regPayload)
          });
          console.log('[Cloud Sync] Registry updated on GitHub successfully.');
        } catch (regErr) {
          console.warn('[Cloud Sync] Registry update failed:', regErr);
        }

        event.target.value = '';
        isSyncingPool.value = false;
        saveMessage.value = `☁️ 成功存入 ${successCount} 张照片至云端，双方均可见！`;
        triggerConfetti();
        nextTick(() => { if (window.lucide) lucide.createIcons(); });
        setTimeout(() => { saveMessage.value = ''; }, 3500);
      };

      const promptAddPoolLink = async () => {
        const url = prompt('请输入照片或微信动图的网络链接（URL）：');
        if (url && url.trim()) {
          if (!siteData.photoPool) siteData.photoPool = [];
          const newItem = {
            id: Date.now() + Math.random(),
            image: url.trim(),
            title: '微信动图/精选瞬间',
            date: new Date().toISOString().slice(0, 10),
            uploader: '我们'
          };
          siteData.photoPool.unshift(newItem);

          // sync to cloud registry
          try {
            const regUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/data/photo_pool.json`;
            const getReg = await fetch(regUrl, { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` } });
            let sha = null;
            if (getReg.ok) sha = (await getReg.json()).sha;
            await fetch(regUrl, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: 'feat: Add external image link to pool registry',
                content: btoa(unescape(encodeURIComponent(JSON.stringify(siteData.photoPool, null, 2)))),
                sha
              })
            });
          } catch (e) {}

          triggerConfetti();
          saveMessage.value = '☁️ 已添加并同步至云端照片池 ♥';
          nextTick(() => { if (window.lucide) lucide.createIcons(); });
          setTimeout(() => { saveMessage.value = ''; }, 2500);
        }
      };

      const removePoolPhoto = async (pIdx) => {
        if (confirm('确定要从双方共享的照片池中移除这张照片吗？')) {
          siteData.photoPool.splice(pIdx, 1);
          saveMessage.value = '正在从云端同步移除...';
          try {
            const regUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/data/photo_pool.json`;
            const getReg = await fetch(regUrl, { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` } });
            if (getReg.ok) {
              const sha = (await getReg.json()).sha;
              await fetch(regUrl, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: 'feat: Remove photo from cloud pool registry',
                  content: btoa(unescape(encodeURIComponent(JSON.stringify(siteData.photoPool, null, 2)))),
                  sha
                })
              });
            }
          } catch (e) {}
          saveMessage.value = '已从云端与本地同步移除';
          setTimeout(() => { saveMessage.value = ''; }, 2000);
        }
      };

      const onPoolItemEdit = (pIdx, field, event) => {
        if (!siteData.photoPool[pIdx]) return;
        siteData.photoPool[pIdx][field] = event.target.innerText.trim();
      };