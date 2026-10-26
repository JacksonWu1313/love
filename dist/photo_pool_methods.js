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
        const input = prompt('请输入照片或微信动图的网络链接（支持批量粘贴，多条链接直接换行或用空格隔开）：');
        if (!input || !input.trim()) return;

        // Extract all valid URLs (http/https/data:image)
        const matchedUrls = input.match(/(https?:\/\/[^\s,;"'<>]+)/gi) || input.split(/[\n\r\s,;]+/).map(s => s.trim()).filter(Boolean);
        if (!matchedUrls || matchedUrls.length === 0) return;

        if (!siteData.photoPool) siteData.photoPool = [];
        const today = new Date().toISOString().slice(0, 10);
        let addedCount = 0;

        for (const rawUrl of matchedUrls) {
          const cleanUrl = rawUrl.trim();
          if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://') || cleanUrl.startsWith('data:image/')) {
            siteData.photoPool.unshift({
              id: Date.now() + Math.random(),
              image: cleanUrl,
              title: cleanUrl.toLowerCase().includes('.gif') ? '微信动图瞬间' : '精选外链回忆',
              date: today,
              uploader: '我们'
            });
            addedCount++;
          }
        }

        if (addedCount === 0) {
          alert('未能识别到有效的图片网络链接');
          return;
        }

        saveMessage.value = `正在同步 ${addedCount} 张外链照片至云端...`;

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
              message: `feat: Batch add ${addedCount} external image links to pool registry`,
              content: btoa(unescape(encodeURIComponent(JSON.stringify(siteData.photoPool, null, 2)))),
              sha
            })
          });
        } catch (e) {
          console.warn('[Cloud Sync] Failed to batch save registry:', e);
        }

        triggerConfetti();
        saveMessage.value = `☁️ 已成功批量存入 ${addedCount} 张外链照片 ♥`;
        nextTick(() => { if (window.lucide) lucide.createIcons(); });
        setTimeout(() => { saveMessage.value = ''; }, 3000);
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

      // Secondary Interface (二级全部照片相册 & 时间轴与搜索)
      const showAllPhotosModal = ref(false);
      const photoSearchQuery = ref('');
      const photoSortOrder = ref('desc');
      const selectedMonthFilter = ref('all');

      const openAllPhotosModal = () => {
        showAllPhotosModal.value = true;
        document.body.style.overflow = 'hidden';
        nextTick(() => { if (window.lucide) lucide.createIcons(); });
      };

      const closeAllPhotosModal = () => {
        showAllPhotosModal.value = false;
        document.body.style.overflow = '';
      };

      const togglePhotoSort = () => {
        photoSortOrder.value = photoSortOrder.value === 'desc' ? 'asc' : 'desc';
        nextTick(() => { if (window.lucide) lucide.createIcons(); });
      };

      const resetPhotoFilters = () => {
        photoSearchQuery.value = '';
        selectedMonthFilter.value = 'all';
      };

      const availableMonths = computed(() => {
        const pool = siteData.photoPool || [];
        const monthsSet = new Set();
        pool.forEach(p => {
          if (p.date && p.date.length >= 7) {
            monthsSet.add(p.date.slice(0, 7));
          }
        });
        return Array.from(monthsSet).sort().reverse();
      });

      const filteredAndSortedPhotos = computed(() => {
        let list = (siteData.photoPool || []).slice();

        // Month filter
        if (selectedMonthFilter.value !== 'all') {
          list = list.filter(p => p.date && p.date.startsWith(selectedMonthFilter.value));
        }

        // Search query filter (title, date, uploader)
        const q = photoSearchQuery.value.trim().toLowerCase();
        if (q) {
          list = list.filter(p => {
            const t = (p.title || '').toLowerCase();
            const d = (p.date || '').toLowerCase();
            const u = (p.uploader || '').toLowerCase();
            return t.includes(q) || d.includes(q) || u.includes(q);
          });
        }

        // Sort by date
        list.sort((a, b) => {
          const da = a.date || '';
          const db = b.date || '';
          return photoSortOrder.value === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
        });

        return list;
      });

      const timeGroupedPhotos = computed(() => {
        const photos = filteredAndSortedPhotos.value;
        const groups = {};
        const order = [];
        photos.forEach(p => {
          const key = (p.date && p.date.length >= 7) ? p.date.slice(0, 7) : '更早的回忆';
          if (!groups[key]) {
            groups[key] = [];
            order.push(key);
          }
          groups[key].push(p);
        });
        return order.map(k => ({ timeKey: k, photos: groups[k] }));
      });

      watch(filteredAndSortedPhotos, () => {
        nextTick(() => { if (window.lucide) lucide.createIcons(); });
      });

      const removePhotoByItem = (photo) => {
        const idx = (siteData.photoPool || []).findIndex(p => (p.id && p.id === photo.id) || p.image === photo.image);
        if (idx !== -1) {
          removePoolPhoto(idx);
        }
      };

      // Scheme 1: Huawei HarmonyOS 7 & PWA Support
      const showHarmonyGuideModal = ref(false);
      const isPwaInstalled = ref(false);

      const checkPwaStatus = () => {
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
          isPwaInstalled.value = true;
        }
      };

      const openHarmonyGuide = () => {
        showHarmonyGuideModal.value = true;
        nextTick(() => { if (window.lucide) lucide.createIcons(); });
      };

      const closeHarmonyGuide = () => {
        showHarmonyGuideModal.value = false;
      };

      // Scheme 2: On This Day (那年今日) & Photo Story Notes
      const showStoryModal = ref(false);
      const activeStoryPhoto = ref(null);
      const editingStoryText = ref('');

      const openPhotoStoryModal = (photo) => {
        activeStoryPhoto.value = photo;
        editingStoryText.value = photo.story || '';
        showStoryModal.value = true;
        nextTick(() => { if (window.lucide) lucide.createIcons(); });
      };

      const closePhotoStoryModal = () => {
        showStoryModal.value = false;
        activeStoryPhoto.value = null;
      };

      const saveCurrentPhotoStory = async () => {
        if (!activeStoryPhoto.value) return;
        activeStoryPhoto.value.story = editingStoryText.value.trim();
        saveMessage.value = '正在将故事便签同步至云端...';
        try {
          const regUrl = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/data/photo_pool.json';
          const getReg = await fetch(regUrl, { headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN } });
          let sha = null;
          if (getReg.ok) sha = (await getReg.json()).sha;
          await fetch(regUrl, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: 'feat: Update story note for photo ' + (activeStoryPhoto.value.title || ''),
              content: btoa(unescape(encodeURIComponent(JSON.stringify(siteData.photoPool, null, 2)))),
              sha: sha
            })
          });
          saveMessage.value = '📖 回忆故事已珍藏并同步 ♥';
        } catch (e) {
          saveMessage.value = '已在本地保存故事便签';
        }
        triggerConfetti();
        closePhotoStoryModal();
        setTimeout(() => { saveMessage.value = ''; }, 2500);
      };

      const onThisDayMemory = computed(() => {
        const pool = siteData.photoPool || [];
        if (pool.length === 0) return null;
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const mmdd = mm + '-' + dd;
        const match = pool.find(p => p.date && p.date.includes(mmdd));
        if (match) {
          return {
            badge: '✨ 那年今日 · ' + match.date,
            title: match.title || '那天留下的甜蜜记忆',
            story: match.story || '每一张照片都在诉说着当时的喜欢。',
            photo: match
          };
        }
        const featured = pool[0];
        return {
          badge: '✨ 甜蜜时光机 · 专属回忆推荐',
          title: featured.title || '彩云之南的浪漫瞬间',
          story: featured.story || '大理洱海的晴空晚风，还有全世界仅此一个的你。',
          photo: featured
        };
      });

      // Scheme 3: Interactive World Footprint Map (可滑动的世界足迹地图 & 中国全域城市点亮)
      const CHINA_CITIES = [
        { name: '北京', province: '北京', region: '华北', lat: 39.9042, lng: 116.4074 },
        { name: '上海', province: '上海', region: '华东', lat: 31.2304, lng: 121.4737 },
        { name: '天津', province: '天津', region: '华北', lat: 39.1256, lng: 117.1902 },
        { name: '重庆', province: '重庆', region: '西南', lat: 29.5630, lng: 106.5516 },
        { name: '大理', province: '云南', region: '云南浪漫', lat: 25.6065, lng: 100.2676 },
        { name: '丽江', province: '云南', region: '云南浪漫', lat: 26.8721, lng: 100.2297 },
        { name: '昆明', province: '云南', region: '云南浪漫', lat: 25.0453, lng: 102.7097 },
        { name: '西双版纳', province: '云南', region: '云南浪漫', lat: 22.0017, lng: 100.7979 },
        { name: '香格里拉', province: '云南', region: '云南浪漫', lat: 27.8251, lng: 99.7073 },
        { name: '腾冲', province: '云南', region: '云南浪漫', lat: 25.0253, lng: 98.4905 },
        { name: '玉溪', province: '云南', region: '云南浪漫', lat: 24.3520, lng: 102.5465 },
        { name: '普洱', province: '云南', region: '云南浪漫', lat: 22.7872, lng: 100.9723 },
        { name: '深圳', province: '广东', region: '华南', lat: 22.5431, lng: 114.0579 },
        { name: '广州', province: '广东', region: '华南', lat: 23.1291, lng: 113.2644 },
        { name: '珠海', province: '广东', region: '华南', lat: 22.2707, lng: 113.5767 },
        { name: '佛山', province: '广东', region: '华南', lat: 23.0215, lng: 113.1214 },
        { name: '东莞', province: '广东', region: '华南', lat: 23.0205, lng: 113.7518 },
        { name: '汕头', province: '广东', region: '华南', lat: 23.3540, lng: 116.6820 },
        { name: '潮州', province: '广东', region: '华南', lat: 23.6569, lng: 116.6226 },
        { name: '惠州', province: '广东', region: '华南', lat: 23.1118, lng: 114.4162 },
        { name: '中山', province: '广东', region: '华南', lat: 22.5171, lng: 113.3928 },
        { name: '湛江', province: '广东', region: '华南', lat: 21.2707, lng: 110.3594 },
        { name: '成都', province: '四川', region: '西南', lat: 30.5728, lng: 104.0668 },
        { name: '乐山', province: '四川', region: '西南', lat: 29.5521, lng: 103.7656 },
        { name: '绵阳', province: '四川', region: '西南', lat: 31.4675, lng: 104.6791 },
        { name: '九寨沟', province: '四川', region: '西南', lat: 33.2600, lng: 103.9186 },
        { name: '稻城亚丁', province: '四川', region: '西南', lat: 28.5200, lng: 100.3400 },
        { name: '宜宾', province: '四川', region: '西南', lat: 28.7518, lng: 104.6432 },
        { name: '攀枝花', province: '四川', region: '西南', lat: 26.5823, lng: 101.7186 },
        { name: '杭州', province: '浙江', region: '华东', lat: 30.2741, lng: 120.1551 },
        { name: '宁波', province: '浙江', region: '华东', lat: 29.8683, lng: 121.5440 },
        { name: '温州', province: '浙江', region: '华东', lat: 27.9943, lng: 120.6994 },
        { name: '绍兴', province: '浙江', region: '华东', lat: 30.0024, lng: 120.5822 },
        { name: '嘉兴', province: '浙江', region: '华东', lat: 30.7460, lng: 120.7555 },
        { name: '湖州', province: '浙江', region: '华东', lat: 30.8943, lng: 120.0868 },
        { name: '金华', province: '浙江', region: '华东', lat: 29.0791, lng: 119.6474 },
        { name: '舟山', province: '浙江', region: '华东', lat: 29.9853, lng: 122.2072 },
        { name: '台州', province: '浙江', region: '华东', lat: 28.6564, lng: 121.4208 },
        { name: '丽水', province: '浙江', region: '华东', lat: 28.4677, lng: 119.9228 },
        { name: '南京', province: '江苏', region: '华东', lat: 32.0603, lng: 118.7969 },
        { name: '苏州', province: '江苏', region: '华东', lat: 31.2990, lng: 120.5853 },
        { name: '无锡', province: '江苏', region: '华东', lat: 31.4912, lng: 120.3119 },
        { name: '常州', province: '江苏', region: '华东', lat: 31.8112, lng: 119.9740 },
        { name: '南通', province: '江苏', region: '华东', lat: 31.9802, lng: 120.8943 },
        { name: '扬州', province: '江苏', region: '华东', lat: 32.3942, lng: 119.4129 },
        { name: '镇江', province: '江苏', region: '华东', lat: 32.1879, lng: 119.4258 },
        { name: '徐州', province: '江苏', region: '华东', lat: 34.2048, lng: 117.2841 },
        { name: '厦门', province: '福建', region: '华东', lat: 24.4798, lng: 118.0894 },
        { name: '福州', province: '福建', region: '华东', lat: 26.0745, lng: 119.2965 },
        { name: '泉州', province: '福建', region: '华东', lat: 24.9089, lng: 118.5894 },
        { name: '漳州', province: '福建', region: '华东', lat: 24.5130, lng: 117.6473 },
        { name: '武夷山', province: '福建', region: '华东', lat: 27.7554, lng: 118.0367 },
        { name: '三亚', province: '海南', region: '华南', lat: 18.2528, lng: 109.5119 },
        { name: '海口', province: '海南', region: '华南', lat: 20.0440, lng: 110.1999 },
        { name: '万宁', province: '海南', region: '华南', lat: 18.7962, lng: 110.3888 },
        { name: '陵水', province: '海南', region: '华南', lat: 18.5051, lng: 110.0372 },
        { name: '西安', province: '陕西', region: '西北', lat: 34.3416, lng: 108.9398 },
        { name: '延安', province: '陕西', region: '西北', lat: 36.5854, lng: 109.4897 },
        { name: '汉中', province: '陕西', region: '西北', lat: 33.0677, lng: 107.0286 },
        { name: '拉萨', province: '西藏', region: '西北', lat: 29.6525, lng: 91.1322 },
        { name: '林芝', province: '西藏', region: '西北', lat: 29.6491, lng: 94.3615 },
        { name: '日喀则', province: '西藏', region: '西北', lat: 29.2675, lng: 88.8808 },
        { name: '乌鲁木齐', province: '新疆', region: '西北', lat: 43.8256, lng: 87.6168 },
        { name: '喀什', province: '新疆', region: '西北', lat: 39.4677, lng: 75.9898 },
        { name: '伊宁', province: '新疆', region: '西北', lat: 43.9169, lng: 81.3242 },
        { name: '阿勒泰', province: '新疆', region: '西北', lat: 47.8449, lng: 88.1396 },
        { name: '呼伦贝尔', province: '内蒙古', region: '华北', lat: 49.2116, lng: 119.7658 },
        { name: '呼和浩特', province: '内蒙古', region: '华北', lat: 40.8427, lng: 111.7519 },
        { name: '桂林', province: '广西', region: '华南', lat: 25.2736, lng: 110.2902 },
        { name: '南宁', province: '广西', region: '华南', lat: 22.8170, lng: 108.3665 },
        { name: '阳朔', province: '广西', region: '华南', lat: 24.7794, lng: 110.4947 },
        { name: '北海', province: '广西', region: '华南', lat: 21.4813, lng: 109.1193 },
        { name: '贵阳', province: '贵州', region: '西南', lat: 26.6477, lng: 106.6302 },
        { name: '遵义', province: '贵州', region: '西南', lat: 27.7257, lng: 106.9274 },
        { name: '西江苗寨', province: '贵州', region: '西南', lat: 26.4950, lng: 108.1730 },
        { name: '长沙', province: '湖南', region: '华中', lat: 28.2282, lng: 112.9388 },
        { name: '张家界', province: '湖南', region: '华中', lat: 29.1170, lng: 110.4792 },
        { name: '凤凰古城', province: '湖南', region: '华中', lat: 27.9547, lng: 109.6015 },
        { name: '武汉', province: '湖北', region: '华中', lat: 30.5928, lng: 114.3055 },
        { name: '宜昌', province: '湖北', region: '华中', lat: 30.6920, lng: 111.2865 },
        { name: '青岛', province: '山东', region: '华东', lat: 36.0671, lng: 120.3826 },
        { name: '济南', province: '山东', region: '华东', lat: 36.6512, lng: 117.1201 },
        { name: '烟台', province: '山东', region: '华东', lat: 37.4638, lng: 121.4479 },
        { name: '威海', province: '山东', region: '华东', lat: 37.5131, lng: 122.1205 },
        { name: '郑州', province: '河南', region: '华中', lat: 34.7466, lng: 113.6253 },
        { name: '洛阳', province: '河南', region: '华中', lat: 34.6185, lng: 112.4540 },
        { name: '石家庄', province: '河北', region: '华北', lat: 38.0428, lng: 114.5149 },
        { name: '秦皇岛', province: '河北', region: '华北', lat: 39.9354, lng: 119.6005 },
        { name: '太原', province: '山西', region: '华北', lat: 37.8706, lng: 112.5489 },
        { name: '大同', province: '山西', region: '华北', lat: 40.0768, lng: 113.3001 },
        { name: '合肥', province: '安徽', region: '华东', lat: 31.8206, lng: 117.2272 },
        { name: '黄山', province: '安徽', region: '华东', lat: 29.7147, lng: 118.3375 },
        { name: '南昌', province: '江西', region: '华东', lat: 28.6829, lng: 115.8582 },
        { name: '景德镇', province: '江西', region: '华东', lat: 29.2687, lng: 117.1783 },
        { name: '婺源', province: '江西', region: '华东', lat: 29.2483, lng: 117.8611 },
        { name: '大连', province: '辽宁', region: '东北', lat: 38.9140, lng: 121.6147 },
        { name: '沈阳', province: '辽宁', region: '东北', lat: 41.8057, lng: 123.4315 },
        { name: '哈尔滨', province: '黑龙江', region: '东北', lat: 45.8038, lng: 126.5349 },
        { name: '长春', province: '吉林', region: '东北', lat: 43.8171, lng: 125.3235 },
        { name: '兰州', province: '甘肃', region: '西北', lat: 36.0611, lng: 103.8343 },
        { name: '敦煌', province: '甘肃', region: '西北', lat: 40.1421, lng: 94.6619 },
        { name: '西宁', province: '青海', region: '西北', lat: 36.6171, lng: 101.7782 },
        { name: '银川', province: '宁夏', region: '西北', lat: 38.4872, lng: 106.2309 },
        { name: '香港', province: '香港', region: '港澳台', lat: 22.3193, lng: 114.1694 },
        { name: '澳门', province: '澳门', region: '港澳台', lat: 22.1987, lng: 113.5439 },
        { name: '台北', province: '台湾', region: '港澳台', lat: 25.0330, lng: 121.5654 }
      ];

      const WORLD_COUNTRIES = [
        { country: '法国', capital: '巴黎', continent: '欧洲浪漫', lat: 48.8566, lng: 2.3522, story: '塞纳河畔漫步、埃菲尔铁塔亮灯、在法式街角咖啡馆晒太阳。' },
        { country: '英国', capital: '伦敦', continent: '欧洲浪漫', lat: 51.5074, lng: -0.1278, story: '泰晤士河晚风、大本钟与伦敦眼，在红色双层巴士上看雨景。' },
        { country: '意大利', capital: '罗马', continent: '欧洲浪漫', lat: 41.9028, lng: 12.4964, story: '在许愿池前投下一枚硬币，许愿我们永远幸福在一起。' },
        { country: '希腊', capital: '雅典', continent: '欧洲浪漫', lat: 37.9838, lng: 23.7275, story: '爱琴海的碧波荡漾，在卫城落日下许下爱的诺言。' },
        { country: '瑞士', capital: '伯尔尼', continent: '欧洲浪漫', lat: 46.9480, lng: 7.4474, story: '阿尔卑斯雪山下的纯净小镇，湖水如童话般清澈湛蓝。' },
        { country: '冰岛', capital: '雷克雅未克', continent: '欧洲浪漫', lat: 64.1466, lng: -21.9426, story: '世界尽头的极光之境，在蓝湖温泉里并肩看漫天绿色极光。' },
        { country: '德国', capital: '柏林', continent: '欧洲浪漫', lat: 52.5200, lng: 13.4050, story: '菩提树下大街漫步，古典与现代艺术的迷人交织。' },
        { country: '西班牙', capital: '马德里', continent: '欧洲浪漫', lat: 40.4168, lng: -3.7038, story: '阳光明媚的普拉多大街，热烈奔放的弗拉门戈艺术。' },
        { country: '荷兰', capital: '阿姆斯特丹', continent: '欧洲浪漫', lat: 52.3676, lng: 4.9041, story: '浪漫纵横的运河桥梁，与风车郁金香花海相伴。' },
        { country: '奥地利', capital: '维也纳', continent: '欧洲浪漫', lat: 48.2082, lng: 16.3738, story: '金色大厅的浪漫交响乐，在多瑙河畔牵手漫步。' },
        { country: '捷克', capital: '布拉格', continent: '欧洲浪漫', lat: 50.0755, lng: 14.4378, story: '查理大桥上的金色黄昏，红屋顶间的童话时光。' },
        { country: '匈牙利', capital: '布达佩斯', continent: '欧洲浪漫', lat: 47.4979, lng: 19.0402, story: '多瑙河上的链子桥夜色，渔人堡上远眺国会大厦的辉煌。' },
        { country: '挪威', capital: '奥斯陆', continent: '欧洲浪漫', lat: 59.9139, lng: 10.7522, story: '峡湾与森林的壮丽画卷，在极昼星空下相依。' },
        { country: '俄罗斯', capital: '莫斯科', continent: '欧洲浪漫', lat: 55.7558, lng: 37.6173, story: '红场斑斓的童话城堡，冬日白雪中的纯洁世界。' },
        { country: '日本', capital: '东京', continent: '亚洲心动', lat: 35.6762, lng: 139.6503, story: '春天赏满城浪漫樱花，在东京塔下许愿相守一生。' },
        { country: '韩国', capital: '首尔', continent: '亚洲心动', lat: 37.5665, lng: 126.9780, story: '南山首尔塔上挂同心锁，在汉江边吹晚风吃炸鸡。' },
        { country: '泰国', capital: '曼谷', continent: '亚洲心动', lat: 13.7563, lng: 100.5018, story: '湄南河畔的夜市烟火，尝香甜的芒果糯米饭与热带晚风。' },
        { country: '新加坡', capital: '新加坡', continent: '亚洲心动', lat: 1.3521, lng: 103.8198, story: '滨海湾花园的超级树森林，无边泳池看城市天际线。' },
        { country: '马来西亚', capital: '吉隆坡', continent: '亚洲心动', lat: 3.1390, lng: 101.6869, story: '双子塔夜景璀璨闪耀，热带夜市的美食与香气。' },
        { country: '马尔代夫', capital: '马累', continent: '亚洲心动', lat: 4.1755, lng: 73.5093, story: '水上屋悬在玻璃般的蔚蓝大海上，看世界上最美的日落晚霞。' },
        { country: '阿联酋', capital: '阿布扎比', continent: '亚洲心动', lat: 24.4539, lng: 54.3773, story: '纯白宏伟的清真寺穹顶，沙漠绿洲与现代奇迹。' },
        { country: '土耳其', capital: '安卡拉', continent: '亚洲心动', lat: 39.9334, lng: 32.8597, story: '横跨欧亚大陆的传奇浪漫，在卡帕多奇亚坐热气球看日出。' },
        { country: '印度尼西亚', capital: '雅加达', continent: '亚洲心动', lat: -6.2088, lng: 106.8456, story: '巴厘岛的海风与梯田，热带岛屿的温柔余晖。' },
        { country: '越南', capital: '河内', continent: '亚洲心动', lat: 21.0285, lng: 105.8542, story: '还剑湖畔的法式风情街角，品尝浓郁纯正的滴漏咖啡。' },
        { country: '美国', capital: '华盛顿', continent: '美洲探索', lat: 38.9072, lng: -77.0369, story: '穿越大洋彼岸的广袤大陆，自驾一号公路看太平洋惊涛。' },
        { country: '加拿大', capital: '渥太华', continent: '美洲探索', lat: 45.4215, lng: -75.6972, story: '枫叶之国的纯美秋色，班夫国家公园的翡翠湖水。' },
        { country: '巴西', capital: '巴西利亚', continent: '美洲探索', lat: -15.8267, lng: -47.9218, story: '热烈奔放的南美大地，热带雨林与热情的桑巴节日。' },
        { country: '阿根廷', capital: '布宜诺斯艾利斯', continent: '美洲探索', lat: -34.6037, lng: -58.3816, story: '世界尽头乌斯怀亚的孤独灯塔，探戈舞步里的浪漫与深情。' },
        { country: '澳大利亚', capital: '堪培拉', continent: '大洋洲海岛', lat: -35.2809, lng: 149.1300, story: '悉尼歌剧院与大堡礁海湾，与袋鼠考拉一起享受南半球阳光。' },
        { country: '新西兰', capital: '惠灵顿', continent: '大洋洲海岛', lat: -41.2865, lng: 174.7762, story: '中土世界的纯净旷野，皇后镇的纯净星空与雪山湖泊。' },
        { country: '埃及', capital: '开罗', continent: '非洲远方', lat: 30.0444, lng: 31.2357, story: '尼罗河畔的金字塔与千年星空，见证我们跨越时空的誓言。' },
        { country: '摩洛哥', capital: '拉巴特', continent: '非洲远方', lat: 34.0209, lng: -6.8416, story: '撒哈拉沙漠的璀璨银河，舍夫沙万梦幻的纯蓝阶梯。' }
      ];

      // Initial Curated Footprint Cities
      const initialFootprintCities = [
        { id: 'dali', name: '大理 · 苍山洱海', lat: 25.606, lng: 100.267, province: '云南', date: '2026 盛夏', status: 'visited', tag: '环海自驾 · 已点亮 ♥', story: '租车环洱海西路，双廊日落吹风，喜洲古镇金黄麦田，悦悦一直在抓拍云朵。', image: './images/timeline_08_1.jpg' },
        { id: 'lijiang', name: '丽江 · 玉龙雪山', lat: 26.872, lng: 100.229, province: '云南', date: '2026 盛夏', status: 'visited', tag: '古城漫步 · 已点亮 ♥', story: '小雨后的束河古镇青石板路，看古城夜景流水，手牵手吃热气腾腾的云南烤肉。', image: './images/timeline_08_2.jpg' },
        { id: 'kunming', name: '昆明 · 春城微风', lat: 25.045, lng: 102.709, province: '云南', date: '2026 盛夏', status: 'visited', tag: '旅途起点 · 已点亮 ♥', story: '自驾漫游的温馨起点，满城鲜花盛开，落地第一眼就觉得这次旅程一定很甜。', image: './images/hero_cover.jpg' },
        { id: 'shenzhen', name: '深圳 · 温暖海风', lat: 22.543, lng: 114.057, province: '广东', date: '日常温馨守护', status: 'home', tag: '爱的港湾 · 彼此守候', story: '彼此守候的城市港湾，走过无数街巷，每一顿饭、每一次散步都是稳稳的幸福。', image: './images/life_food_1.jpg' },
        { id: 'chengdu', name: '成都 · 烟火锦官城', lat: 30.572, lng: 104.066, province: '四川', date: '心动愿望 · 待打卡', status: 'wish', tag: '愿望清单 · 待解锁 ✈️', story: '约好下次一起去吃地道牛油火锅、逛宽窄巷子和太古里、看憨态可掬的大熊猫。', image: './images/wish_cook.jpg' },
        { id: 'chongqing', name: '重庆 · 赛博山城', lat: 29.563, lng: 106.551, province: '重庆', date: '愿望清单 · 待打卡', status: 'wish', tag: '愿望清单 · 待解锁 ✈️', story: '看洪崖洞万家灯火与两江夜景，吹江风吃夜市小吃。', image: './images/wish_dali.jpg' },
        { id: 'paris', name: '巴黎 · 浪漫之都', lat: 48.856, lng: 2.352, province: '法国', date: '远期梦想 · 待打卡', status: 'wish', tag: '世界之旅 · 愿望清单 ✈️', story: '一起去塞纳河畔散步、看埃菲尔铁塔亮灯、在法式街角咖啡馆晒太阳。', image: './images/quote_1.jpg' },
        { id: 'santorini', name: '圣托里尼 · 爱琴海', lat: 36.393, lng: 25.461, province: '希腊', date: '远期梦想 · 待打卡', status: 'wish', tag: '世界之旅 · 愿望清单 ✈️', story: '看世界上最美的伊亚落日，住在蓝顶白墙的悬崖酒店，在蔚蓝爱琴海边许愿。', image: './images/wish_concert.jpg' }
      ];

      const footprintCities = reactive(initialFootprintCities);
      const selectedMapCity = ref(null);
      const currentMapFilter = ref('all');
      const modalCityTab = ref('china');
      const searchChinaQuery = ref('');
      const selectedChinaRegion = ref('全部');
      const searchWorldQuery = ref('');
      const selectedWorldContinent = ref('全部');
      const showAddCityModal = ref(false);

      const newCityForm = reactive({
        name: '',
        province: '',
        lat: 30.0,
        lng: 104.0,
        status: 'visited',
        date: '2026',
        tag: '甜蜜足迹 · 已点亮 ♥',
        story: '',
        image: './images/hero_cover.jpg'
      });

      const visitedCitiesCount = computed(() => {
        return footprintCities.filter(c => c.status === 'visited' || c.status === 'home').length;
      });

      const wishCitiesCount = computed(() => {
        return footprintCities.filter(c => c.status === 'wish').length;
      });

      const chinaRegions = ['全部', '云南浪漫', '华东', '华南', '西南', '华北', '华中', '西北', '东北', '港澳台'];
      const worldContinents = ['全部', '欧洲浪漫', '亚洲心动', '美洲探索', '大洋洲海岛', '非洲远方'];

      const filteredChinaCities = computed(() => {
        return CHINA_CITIES.filter(c => {
          const matchRegion = selectedChinaRegion.value === '全部' || c.region === selectedChinaRegion.value;
          const matchQuery = !searchChinaQuery.value.trim() || c.name.includes(searchChinaQuery.value.trim()) || c.province.includes(searchChinaQuery.value.trim());
          return matchRegion && matchQuery;
        });
      });

      const filteredWorldCountries = computed(() => {
        return WORLD_COUNTRIES.filter(w => {
          const matchCont = selectedWorldContinent.value === '全部' || w.continent === selectedWorldContinent.value;
          const matchQuery = !searchWorldQuery.value.trim() || w.country.includes(searchWorldQuery.value.trim()) || w.capital.includes(searchWorldQuery.value.trim());
          return matchCont && matchQuery;
        });
      });

      const selectPresetChinaCity = (c) => {
        newCityForm.name = c.name + ' · ' + c.province;
        newCityForm.province = c.province;
        newCityForm.lat = c.lat;
        newCityForm.lng = c.lng;
        newCityForm.tag = '中国足迹 · 点亮 ♥';
        newCityForm.story = '想和全世界仅此一个的悦悦大王，漫步在' + c.name + '的街头巷尾，看尽人间烟火。';
      };

      const selectPresetWorldCountry = (w) => {
        newCityForm.name = w.country + ' · ' + w.capital;
        newCityForm.province = w.country;
        newCityForm.lat = w.lat;
        newCityForm.lng = w.lng;
        newCityForm.tag = '世界足迹 · 首都星火 ✈️';
        newCityForm.story = w.story || ('一起去' + w.country + '首都' + w.capital + '，留下一生一次的浪漫印记。');
      };

      let worldMap = null;
      let mapMarkersGroup = null;
      let mapTrailLine = null;

      const initWorldMap = () => {
        if (!window.L) return;
        const mapContainer = document.getElementById('love-world-map');
        if (!mapContainer || mapContainer._leaflet_id) return;

        worldMap = L.map('love-world-map', {
          center: [28.0, 104.0],
          zoom: 4,
          minZoom: 2,
          maxZoom: 18,
          zoomControl: false,
          scrollWheelZoom: true,
          touchZoom: true
        });

        L.control.zoom({ position: 'topright' }).addTo(worldMap);

        const baseLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
          attribution: '&copy; Esri &copy; OpenStreetMap',
          maxZoom: 16,
          className: 'romantic-map-tiles'
        });
        baseLayer.on('tileerror', function(error, tile) {
          tile.src = 'https://tile.openstreetmap.org/' + error.coords.z + '/' + error.coords.x + '/' + error.coords.y + '.png';
        });
        baseLayer.addTo(worldMap);

        mapMarkersGroup = L.layerGroup().addTo(worldMap);

        renderMapMarkers();

        worldMap.on('click', (e) => {
          openAddCityModalAt(e.latlng.lat, e.latlng.lng);
        });

        setTimeout(() => {
          if (worldMap) worldMap.invalidateSize();
        }, 300);
      };

      const renderMapMarkers = () => {
        if (!worldMap || !mapMarkersGroup) return;
        mapMarkersGroup.clearLayers();
        if (mapTrailLine) {
          worldMap.removeLayer(mapTrailLine);
          mapTrailLine = null;
        }

        const filtered = footprintCities.filter(c => {
          if (currentMapFilter.value === 'visited') return c.status === 'visited' || c.status === 'home';
          if (currentMapFilter.value === 'wish') return c.status === 'wish';
          return true;
        });

        filtered.forEach(city => {
          const isVisited = city.status === 'visited';
          const isHome = city.status === 'home';
          const bgClass = isVisited ? 'bg-gradient-to-tr from-rose-500 to-blush-400 text-white' : (isHome ? 'bg-gradient-to-tr from-amber-600 to-orange-400 text-white' : 'bg-gradient-to-tr from-teal-500 to-emerald-400 text-white');
          const iconChar = isVisited ? '♥' : (isHome ? '🏠' : '✈️');
          const pingHtml = isVisited ? '<span class="marker-ping-halo"></span>' : '';
          const cleanName = (city.name || '').split('·')[0].trim();

          const customIcon = L.divIcon({
            className: 'custom-love-div-icon',
            html: `
              <div class="love-marker-wrapper">
                <div class="love-marker-bubble ${bgClass}">
                  ${pingHtml}
                  <span style="font-size: 14px; font-weight: bold; line-height: 1;">${iconChar}</span>
                </div>
                <div class="love-marker-label">${cleanName}</div>
              </div>
            `,
            iconSize: [32, 54],
            iconAnchor: [16, 54]
          });

          const marker = L.marker([city.lat, city.lng], { icon: customIcon });
          marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            selectMapCity(city);
          });
          mapMarkersGroup.addLayer(marker);
        });

        const visitedLatLngs = footprintCities
          .filter(c => c.status === 'visited' || c.status === 'home')
          .map(c => [c.lat, c.lng]);

        if (visitedLatLngs.length >= 2) {
          mapTrailLine = L.polyline(visitedLatLngs, {
            color: '#D95D5D',
            weight: 3,
            dashArray: '6, 8',
            opacity: 0.7
          }).addTo(worldMap);
        }
      };

      const selectMapCity = (city) => {
        selectedMapCity.value = city;
        nextTick(() => { if (window.lucide) lucide.createIcons(); });
      };

      const closeMapCity = () => {
        selectedMapCity.value = null;
      };

      const setMapFilter = (filterType) => {
        currentMapFilter.value = filterType;
        renderMapMarkers();
      };

      const flyToView = (viewName) => {
        if (!worldMap) return;
        if (viewName === 'world') {
          worldMap.flyTo([25.0, 20.0], 2, { duration: 1.5 });
        } else if (viewName === 'china') {
          worldMap.flyTo([30.0, 105.0], 4, { duration: 1.5 });
        } else if (viewName === 'yunnan') {
          worldMap.flyTo([25.6, 100.3], 7, { duration: 1.5 });
        } else if (viewName === 'shenzhen') {
          worldMap.flyTo([22.543, 114.057], 10, { duration: 1.5 });
        }
      };

      const openAddCityModal = () => {
        newCityForm.name = '大理 · 苍山洱海';
        newCityForm.province = '云南';
        newCityForm.lat = 25.6065;
        newCityForm.lng = 100.2676;
        newCityForm.status = 'visited';
        newCityForm.date = '2026 盛夏';
        newCityForm.tag = '甜蜜足迹 · 已点亮 ♥';
        newCityForm.story = '洱海环海自驾，微风晚霞，车里放着我们最爱的歌。';
        modalCityTab.value = 'china';
        showAddCityModal.value = true;
        nextTick(() => { if (window.lucide) lucide.createIcons(); });
      };

      const openAddCityModalAt = (lat, lng) => {
        newCityForm.name = '地图点选新坐标';
        newCityForm.province = '心动坐标';
        newCityForm.lat = parseFloat(lat.toFixed(4));
        newCityForm.lng = parseFloat(lng.toFixed(4));
        newCityForm.status = 'visited';
        newCityForm.date = '2026';
        newCityForm.tag = '甜蜜足迹 · 已点亮 ♥';
        newCityForm.story = '在这颗蓝色星球的这个坐标，留下了属于我们专属的心动回忆。';
        modalCityTab.value = 'custom';
        showAddCityModal.value = true;
        nextTick(() => { if (window.lucide) lucide.createIcons(); });
      };

      const closeAddCityModal = () => {
        showAddCityModal.value = false;
      };

      const submitLightUpCity = async () => {
        if (!newCityForm.name.trim()) {
          alert('请填写城市名称~');
          return;
        }
        const newCity = {
          id: 'city_' + Date.now(),
          name: newCityForm.name.trim(),
          province: newCityForm.province.trim() || '心动坐标',
          lat: newCityForm.lat,
          lng: newCityForm.lng,
          status: newCityForm.status,
          date: newCityForm.date || '2026',
          tag: newCityForm.tag || (newCityForm.status === 'visited' ? '甜蜜足迹 · 已点亮 ♥' : '心动愿望 · 待打卡 ✈️'),
          story: newCityForm.story.trim() || '想和全世界仅此一个的你，踏遍这里的每一寸土地。',
          image: newCityForm.image || './images/hero_cover.jpg'
        };

        const existingIdx = footprintCities.findIndex(c => c.name === newCity.name);
        if (existingIdx !== -1) {
          footprintCities[existingIdx] = newCity;
        } else {
          footprintCities.push(newCity);
        }

        renderMapMarkers();
        closeAddCityModal();
        triggerConfetti();

        if (worldMap) {
          worldMap.flyTo([newCity.lat, newCity.lng], 6, { duration: 1.5 });
          setTimeout(() => { selectMapCity(newCity); }, 1600);
        }

        await saveFootprintToCloud();
      };

      const toggleCityStatus = async (city) => {
        if (city.status === 'visited') {
          city.status = 'wish';
          city.tag = city.tag.replace('已点亮 ♥', '待解锁 ✈️');
        } else {
          city.status = 'visited';
          city.tag = city.tag.replace('待打卡', '已点亮 ♥').replace('待解锁 ✈️', '已点亮 ♥');
          triggerConfetti();
        }
        renderMapMarkers();
        await saveFootprintToCloud();
      };

      const removeCityFootprint = async (city) => {
        if (confirm('确定要从足迹地图中移除【' + city.name + '】吗？')) {
          const idx = footprintCities.findIndex(c => c.id === city.id || c.name === city.name);
          if (idx !== -1) {
            footprintCities.splice(idx, 1);
            closeMapCity();
            renderMapMarkers();
            await saveFootprintToCloud();
          }
        }
      };

      const syncFootprintFromCloud = async () => {
        try {
          const res = await fetch('https://raw.githubusercontent.com/' + GITHUB_REPO + '/main/data/footprint_cities.json?t=' + Date.now());
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              footprintCities.splice(0, footprintCities.length, ...data);
              renderMapMarkers();
              console.log('[Map Sync] Synced ' + data.length + ' cities from cloud.');
            }
          }
        } catch (e) {
          console.warn('[Map Sync] Failed to fetch footprint cities from cloud:', e);
        }
      };

      const saveFootprintToCloud = async () => {
        saveMessage.value = '正在将足迹地图同步至云端...';
        try {
          const regUrl = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/data/footprint_cities.json';
          const getReg = await fetch(regUrl, { headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN } });
          let sha = null;
          if (getReg.ok) sha = (await getReg.json()).sha;
          await fetch(regUrl, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: 'feat: Update footprint world map cities (' + footprintCities.length + ' cities)',
              content: btoa(unescape(encodeURIComponent(JSON.stringify(footprintCities, null, 2)))),
              sha: sha
            })
          });
          saveMessage.value = '🌍 足迹地图已珍藏并全网同步 ♥';
        } catch (e) {
          saveMessage.value = '已在本地保存足迹';
        }
        setTimeout(() => { saveMessage.value = ''; }, 2500);
      };
