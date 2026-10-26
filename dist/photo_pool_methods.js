      // Photo Pool Functions (Unlimited Photo Vault with Canvas Compression)
      const poolFileInput = ref(null);
      const triggerPoolUpload = () => {
        if (poolFileInput.value) poolFileInput.value.click();
      };

      const compressImage = (file, maxDim = 1200, quality = 0.85) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
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
              resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      const handlePoolFilesSelected = async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        saveMessage.value = '正在智能压缩并存入照片池...';
        if (!siteData.photoPool) siteData.photoPool = [];
        
        let count = 0;
        const today = new Date().toISOString().slice(0, 10);
        for (let i = 0; i < files.length; i++) {
          try {
            const base64 = await compressImage(files[i]);
            siteData.photoPool.unshift({
              id: Date.now() + Math.random(),
              image: base64,
              title: files[i].name.replace(/\.[^/.]+$/, '') || '我们的美好瞬间',
              date: today,
              uploader: '我们'
            });
            count++;
          } catch (err) {
            console.error('Photo compress error:', err);
          }
        }
        event.target.value = '';
        saveMessage.value = `成功存入 ${count} 张照片到照片池 ♥`;
        triggerConfetti();
        nextTick(() => { if (window.lucide) lucide.createIcons(); });
        setTimeout(() => { saveMessage.value = ''; }, 3000);
      };

      const promptAddPoolLink = () => {
        const url = prompt('请输入照片的网络图片链接（URL）：');
        if (url && url.trim()) {
          if (!siteData.photoPool) siteData.photoPool = [];
          siteData.photoPool.unshift({
            id: Date.now() + Math.random(),
            image: url.trim(),
            title: '网图/合照瞬间',
            date: new Date().toISOString().slice(0, 10),
            uploader: '我们'
          });
          triggerConfetti();
          saveMessage.value = '已存入新照片链接 ♥';
          nextTick(() => { if (window.lucide) lucide.createIcons(); });
          setTimeout(() => { saveMessage.value = ''; }, 2500);
        }
      };

      const removePoolPhoto = (pIdx) => {
        if (confirm('确定要从照片池中移除这张照片吗？')) {
          siteData.photoPool.splice(pIdx, 1);
          saveMessage.value = '已移除照片';
          setTimeout(() => { saveMessage.value = ''; }, 2000);
        }
      };

      const onPoolItemEdit = (pIdx, field, event) => {
        if (!siteData.photoPool[pIdx]) return;
        siteData.photoPool[pIdx][field] = event.target.innerText.trim();
      };
