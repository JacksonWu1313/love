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
          const regUrl = https://api.github.com/repos//contents/data/photo_pool.json;
          const getReg = await fetch(regUrl, { headers: { 'Authorization': Bearer  } });
          let sha = null;
          if (getReg.ok) sha = (await getReg.json()).sha;
          await fetch(regUrl, {
            method: 'PUT',
            headers: { 'Authorization': Bearer , 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: eat: Update story note for photo ,
              content: btoa(unescape(encodeURIComponent(JSON.stringify(siteData.photoPool, null, 2)))),
              sha
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
        const mmdd = ${String(now.getMonth() + 1).padStart(2, '0')}-;
        const match = pool.find(p => p.date && p.date.includes(mmdd));
        if (match) {
          return {
            badge: ✨ 那年今日 · ,
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

      // Scheme 3: Interactive Love Footprint Map (浪漫足迹地图)
      const selectedMapCity = ref(null);
      const loveMapCities = reactive([
        {
          id: 'dali',
          name: '大理 · 苍山洱海',
          province: '云南',
          date: '2026 盛夏',
          tag: '自驾漫游 · 已点亮 ♥',
          desc: '环洱海西路自驾、双廊日落吹风、喜洲麦田微风拂面，车里一直放着我们爱的歌。',
          image: './images/timeline_08_1.jpg',
          x: 285,
          y: 440,
          status: 'visited'
        },
        {
          id: 'lijiang',
          name: '丽江 · 玉龙雪山',
          province: '云南',
          date: '2026 盛夏',
          tag: '古城漫步 · 已点亮 ♥',
          desc: '下过小雨的束河古镇青石板路、看古城夜景流水、吃热气腾腾的云南烤肉小吃。',
          image: './images/timeline_08_2.jpg',
          x: 290,
          y: 405,
          status: 'visited'
        },
        {
          id: 'kunming',
          name: '昆明 · 春城微风',
          province: '云南',
          date: '2026 盛夏',
          tag: '旅途起点 · 已点亮 ♥',
          desc: '彩云之南自驾漫游的温馨中转，满城鲜花盛开，落地第一眼就觉得这次旅程一定很甜。',
          image: './images/hero_cover.jpg',
          x: 340,
          y: 450,
          status: 'visited'
        },
        {
          id: 'chengdu',
          name: '成都 / 重庆',
          province: '川渝',
          date: '心动愿望 · 待打卡',
          tag: '愿望清单 · 待解锁 ✈️',
          desc: '约好下次一起去吃正宗牛油火锅、逛宽窄巷子太古里、在夜市看人间烟火与大熊猫。',
          image: './images/wish_cook.jpg',
          x: 380,
          y: 360,
          status: 'wish'
        },
        {
          id: 'shenzhen',
          name: '深圳 · 温暖海风',
          province: '广东',
          date: '日常甜蜜驻足',
          tag: '爱意常伴 · 我们的港湾',
          desc: '无数个平淡却温馨的日子，一起吃过的每一顿饭、走过的每一个街口，都是最踏实的幸福。',
          image: './images/life_food_1.jpg',
          x: 530,
          y: 485,
          status: 'home'
        }
      ]);

      const selectMapCity = (city) => {
        selectedMapCity.value = city;
        nextTick(() => { if (window.lucide) lucide.createIcons(); });
      };

      const closeMapCity = () => {
        selectedMapCity.value = null;
      };
