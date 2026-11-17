(function () {
    'use strict';

    const ALL_CHANNELS = (typeof ALL_BEKA_CHANNELS !== 'undefined' && Array.isArray(ALL_BEKA_CHANNELS))
        ? ALL_BEKA_CHANNELS
        : [];

    const LOCAL_MOVIES = (typeof window.LOCAL_MOVIES !== 'undefined' && Array.isArray(window.LOCAL_MOVIES) && window.LOCAL_MOVIES.length > 0)
        ? window.LOCAL_MOVIES
        : ((typeof ALL_NEXTX_MOVIES !== 'undefined' && Array.isArray(ALL_NEXTX_MOVIES)) ? ALL_NEXTX_MOVIES : []);

    const TMDB_KEY = "844dba0bfd8f3a4f3799f6130ef9e335";
    const TMDB_BASE = "https://api.themoviedb.org/3";
    const IMG_BASE = "https://image.tmdb.org/t/p/w500";

    // iOS Safari Add to Home Screen Banner
    const iosBanner = document.getElementById('ios-install-banner');
    const btnDismissIos = document.getElementById('btn-dismiss-ios');
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (isIos && !isStandalone && iosBanner && !localStorage.getItem('nextx_ios_dismissed')) {
        iosBanner.style.display = 'flex';
    }
    if (btnDismissIos) {
        btnDismissIos.addEventListener('click', () => {
            iosBanner.style.display = 'none';
            localStorage.setItem('nextx_ios_dismissed', '1');
        });
    }

    // Intro X -> NEXTX ROOM Video Animation
    const introOverlay = document.getElementById('intro-overlay');
    const introVideo = document.getElementById('intro-video');
    let introTimer = null;
    function playIntroAnimation(durationMs) {
        if (!introOverlay || !introVideo) return;
        clearTimeout(introTimer);
        introOverlay.classList.remove('fade-out');
        introOverlay.classList.add('active');
        try {
            introVideo.currentTime = 0;
            introVideo.play().catch(() => {});
        } catch (e) {}
        const closeFn = () => {
            introOverlay.classList.add('fade-out');
            setTimeout(() => {
                introOverlay.classList.remove('active', 'fade-out');
                try { introVideo.pause(); } catch (e) {}
            }, 350);
        };
        introVideo.onended = closeFn;
        introTimer = setTimeout(closeFn, durationMs || 2600);
    }

    // State
    let activeTab = "cinema";
    let currentLanguage = "GEO";
    let currentCategory = "ALL";
    let currentMoviePage = 1;
    let isLoadingMore = false;
    let hasMorePages = true;
    let searchQuery = "";
    let movies = [];
    let selectedMovie = null;
    let selectedStreamIndex = 0;
    let selectedSeasonIndex = 0;
    let selectedEpisodeIndex = 0;
    let activeChannelGroup = "ALL";

    // DOM
    const mainScroll = document.getElementById('main-scroll');
    const tabCinema = document.getElementById('tab-cinema');
    const tabTv = document.getElementById('tab-tv');
    const cinemaFilters = document.getElementById('cinema-filters');
    const continueSection = document.getElementById('continue-section');
    const continueRow = document.getElementById('continue-row');
    const moviesGrid = document.getElementById('movies-grid');
    const gridLoader = document.getElementById('grid-loader');
    const emptyState = document.getElementById('empty-state');
    const catalogTitle = document.getElementById('catalog-title');
    const catalogCount = document.getElementById('catalog-count');
    const tvList = document.getElementById('tv-list');
    const tvCount = document.getElementById('tv-count');

    const searchWrap = document.getElementById('search-bar-wrap');
    const searchInput = document.getElementById('search-input');
    const btnToggleSearch = document.getElementById('btn-toggle-search');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const btnCaveaTop = document.getElementById('btn-cavea-top');

    const sheetBackdrop = document.getElementById('movie-sheet-backdrop');
    const btnSheetClose = document.getElementById('btn-sheet-close');
    const dlgPoster = document.getElementById('dlg-poster');
    const dlgTitle = document.getElementById('dlg-title');
    const dlgYear = document.getElementById('dlg-year');
    const dlgRating = document.getElementById('dlg-rating');
    const dlgLangBadge = document.getElementById('dlg-lang-badge');
    const dlgCatBadge = document.getElementById('dlg-cat-badge');
    const dlgDesc = document.getElementById('dlg-desc');
    const sheetEpisodesWrap = document.getElementById('sheet-episodes-wrap');
    const dlgSeasonsRow = document.getElementById('dlg-seasons-row');
    const dlgEpisodesList = document.getElementById('dlg-episodes-list');
    const dlgSourcesChips = document.getElementById('dlg-sources-chips');
    const btnDlgPlay = document.getElementById('btn-dlg-play');
    const btnDlgFav = document.getElementById('btn-dlg-fav');

    // PWA Player Modal DOM
    const pwaPlayerModal = document.getElementById('pwa-player-modal');
    const btnPwaClose = document.getElementById('btn-pwa-close');
    const pwaPlayerTitle = document.getElementById('pwa-player-title');
    const pwaPlayerSub = document.getElementById('pwa-player-sub');
    const pwaVideo = document.getElementById('pwa-video');
    const pwaIframe = document.getElementById('pwa-iframe');
    const pwaPlayerActions = document.getElementById('pwa-player-actions');

    let hlsInstance = null;
    let currentChannelIdx = 0;
    let currentPlayingMovie = null;

    function openCaveaPortal() {
        switchTab('cavea');
    }
    if (btnCaveaTop) btnCaveaTop.addEventListener('click', openCaveaPortal);

    // Continue Watching
    function getContinueList() {
        try { return JSON.parse(localStorage.getItem('nextx_continue_watching') || '[]'); }
        catch (e) { return []; }
    }

    function saveContinueItem(movie, posSec, durSec) {
        if (!movie || !posSec || posSec < 5) return;
        const list = getContinueList();
        const key = movie.tmdbId ? `tmdb_${movie.tmdbId}` : (movie.id || movie.title);
        const filtered = list.filter(x => (x.tmdbId ? `tmdb_${x.tmdbId}` : (x.id || x.title)) !== key);
        const entry = Object.assign({}, movie, {
            id: key,
            positionMs: Math.floor(posSec * 1000),
            durationMs: Math.floor((durSec || 0) * 1000),
            updatedAt: Date.now()
        });
        filtered.unshift(entry);
        localStorage.setItem('nextx_continue_watching', JSON.stringify(filtered.slice(0, 20)));
        renderContinueWatching();
    }

    function renderContinueWatching() {
        if (activeTab !== 'cinema' || searchQuery) {
            continueSection.style.display = 'none';
            return;
        }
        const list = getContinueList();
        if (!list.length) {
            continueSection.style.display = 'none';
            return;
        }
        continueSection.style.display = 'block';
        continueRow.innerHTML = '';
        list.forEach(item => {
            const pct = item.durationMs > 0 ? Math.min(100, Math.round((item.positionMs / item.durationMs) * 100)) : 20;
            const mins = Math.floor((item.positionMs || 0) / 60000);
            const card = document.createElement('div');
            card.className = 'continue-card';
            card.innerHTML = `
                <div class="continue-poster-wrap">
                    <img src="${item.poster || 'icon.png'}" alt="" onerror="this.src='icon.png'">
                    <div class="continue-play-badge">▶</div>
                    <div class="continue-progress-track">
                        <div class="continue-progress-fill" style="width:${pct}%"></div>
                    </div>
                </div>
                <div class="continue-title">${item.title || ''}</div>
                <div class="continue-sub">${mins} წთ-დან</div>
            `;
            card.addEventListener('click', () => openMovieSheet(item, item.positionMs));
            continueRow.appendChild(card);
        });
    }

    // Favorites
    function getFavorites() {
        try { return JSON.parse(localStorage.getItem('nextx_favorites') || '[]'); }
        catch (e) { return []; }
    }

    function isFavorite(movie) {
        if (!movie) return false;
        const key = movie.tmdbId ? `tmdb_${movie.tmdbId}` : (movie.id || movie.title);
        return getFavorites().some(f => (f.tmdbId ? `tmdb_${f.tmdbId}` : (f.id || f.title)) === key);
    }

    function toggleFavorite(movie) {
        if (!movie) return;
        const favs = getFavorites();
        const key = movie.tmdbId ? `tmdb_${movie.tmdbId}` : (movie.id || movie.title);
        const idx = favs.findIndex(f => (f.tmdbId ? `tmdb_${f.tmdbId}` : (f.id || f.title)) === key);
        if (idx >= 0) favs.splice(idx, 1);
        else favs.unshift(movie);
        localStorage.setItem('nextx_favorites', JSON.stringify(favs));
        updateFavButton();
        if (activeTab === 'favorites') loadFavorites();
    }

    function updateFavButton() {
        btnDlgFav.textContent = isFavorite(selectedMovie) ? "💔 წაშლა" : "❤️ შენახვა";
    }

    // Tabs
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    function switchTab(tab) {
        const wasNonCinema = activeTab !== 'cinema';
        activeTab = tab;
        document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

        if (tab === 'tv') {
            tabCinema.classList.remove('active');
            tabTv.classList.add('active');
            renderTvList();
        } else if (tab === 'cavea') {
            tabTv.classList.remove('active');
            tabCinema.classList.add('active');
            cinemaFilters.style.display = 'none';
            continueSection.style.display = 'none';
            hasMorePages = false;
            const caveaList = Array.isArray(window.CAVEA_FREE_MOVIES) ? window.CAVEA_FREE_MOVIES : [];
            catalogTitle.textContent = "🍿 Cavea+ • უფასო ფილმები";
            movies = caveaList;
            catalogCount.textContent = movies.length + " ფილმი";
            gridLoader.style.display = 'none';
            renderMovies(movies);
        } else if (tab === 'favorites') {
            tabTv.classList.remove('active');
            tabCinema.classList.add('active');
            cinemaFilters.style.display = 'none';
            continueSection.style.display = 'none';
            loadFavorites();
        } else {
            tabTv.classList.remove('active');
            tabCinema.classList.add('active');
            cinemaFilters.style.display = 'block';
            if (wasNonCinema) playIntroAnimation(2400);
            renderContinueWatching();
            if (searchQuery) performMovieSearch(searchQuery);
            else loadMoviesCatalog();
        }
        mainScroll.scrollTop = 0;
    }

    document.querySelectorAll('#lang-row .pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#lang-row .pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentLanguage = pill.dataset.lang;
            searchQuery = "";
            searchInput.value = "";
            loadMoviesCatalog();
        });
    });

    document.querySelectorAll('#cat-row .pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#cat-row .pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentCategory = pill.dataset.cat;
            searchQuery = "";
            searchInput.value = "";
            loadMoviesCatalog();
        });
    });

    document.querySelectorAll('#tv-group-row .pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#tv-group-row .pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeChannelGroup = pill.dataset.grp;
            renderTvList();
        });
    });

    // Search
    let searchTimer = null;
    btnToggleSearch.addEventListener('click', () => {
        searchWrap.classList.toggle('hidden');
        if (!searchWrap.classList.contains('hidden')) searchInput.focus();
        else clearSearch();
    });

    btnClearSearch.addEventListener('click', () => {
        clearSearch();
        searchWrap.classList.add('hidden');
    });

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            searchQuery = searchInput.value.trim();
            if (activeTab === 'tv') renderTvList();
            else {
                if (activeTab === 'favorites') switchTab('cinema');
                if (searchQuery.length >= 2) performMovieSearch(searchQuery);
                else if (searchQuery.length === 0) loadMoviesCatalog();
            }
        }, 350);
    });

    function clearSearch() {
        searchQuery = "";
        searchInput.value = "";
        if (activeTab === 'tv') renderTvList();
        else if (activeTab === 'cinema') loadMoviesCatalog();
    }

    function loadFavorites() {
        catalogTitle.textContent = "❤️ ჩემი რჩეულები";
        movies = getFavorites();
        gridLoader.style.display = 'none';
        catalogCount.textContent = movies.length + " ფილმი";
        renderMovies(movies);
    }

    function loadMoviesCatalog() {
        currentMoviePage = 1;
        isLoadingMore = false;
        hasMorePages = true;
        gridLoader.style.display = 'block';
        moviesGrid.innerHTML = '';
        emptyState.style.display = 'none';
        renderContinueWatching();

        const catNames = {
            ALL: "🔥 პოპულარული ფილმები",
            GEO_MOVIES: "🇬🇪 ქართული კინო",
            ACTION: "💥 მძაფრსიუჟეტიანი",
            COMEDY: "😂 კომედია",
            SCIFI: "🚀 ფანტასტიკა",
            ANIMATION: "👶 ანიმაცია",
            SERIES: "🍿 სერიალები",
            CLASSICS: "👑 საკულტო კლასიკა"
        };
        let titleLabel = catNames[currentCategory] || "🔥 პოპულარული";
        if (currentLanguage === 'GEO') titleLabel += " • ქართულად";
        else if (currentLanguage === 'TUR') titleLabel += " • თურქულად";
        else if (currentLanguage === 'RUS') titleLabel += " • რუსულად";
        else if (currentLanguage === 'ENG') titleLabel += " • ინგლისურად";
        catalogTitle.textContent = titleLabel;

        fetchMoviesPage(1, (newItems) => {
            gridLoader.style.display = 'none';
            let initial = [];
            if (currentCategory === 'GEO_MOVIES') {
                initial = LOCAL_MOVIES.filter(m => m.category === 'GEO_MOVIES').concat(newItems);
            } else if (currentLanguage === 'GEO') {
                const local = currentCategory === 'ALL'
                    ? LOCAL_MOVIES
                    : LOCAL_MOVIES.filter(m => m.category === currentCategory);
                initial = local.concat(newItems);
            } else {
                initial = newItems;
            }

            const seen = new Set();
            movies = [];
            initial.forEach(item => {
                const key = item.tmdbId ? `tmdb_${item.tmdbId}` : (item.id || item.title);
                if (!seen.has(key)) {
                    seen.add(key);
                    movies.push(item);
                }
            });
            catalogCount.textContent = movies.length + " ფილმი";
            renderMovies(movies);
        });
    }

    function fetchMoviesPage(page, callback) {
        let endpoint = "/discover/movie?sort_by=popularity.desc&vote_count.gte=50&primary_release_date.lte=2025-01-01";
        let langParam = currentLanguage === 'RUS' ? 'ru-RU'
            : (currentLanguage === 'ENG' ? 'en-US'
            : (currentLanguage === 'TUR' ? 'tr-TR' : 'ka-GE'));

        if (currentCategory === 'GEO_MOVIES') endpoint = "/discover/movie?with_original_language=ka&sort_by=popularity.desc";
        else if (currentCategory === 'ACTION') endpoint = "/discover/movie?with_genres=28&sort_by=popularity.desc&vote_count.gte=50";
        else if (currentCategory === 'COMEDY') endpoint = "/discover/movie?with_genres=35&sort_by=popularity.desc&vote_count.gte=50";
        else if (currentCategory === 'SCIFI') endpoint = "/discover/movie?with_genres=878&sort_by=popularity.desc&vote_count.gte=50";
        else if (currentCategory === 'ANIMATION') endpoint = "/discover/movie?with_genres=16&sort_by=popularity.desc&vote_count.gte=50";
        else if (currentCategory === 'SERIES') endpoint = "/discover/tv?sort_by=vote_average.desc&vote_count.gte=100";
        else if (currentCategory === 'CLASSICS') endpoint = "/movie/top_rated?vote_count.gte=100";

        if (currentLanguage === 'TUR') {
            if (currentCategory === 'SERIES') endpoint = "/discover/tv?with_original_language=tr&sort_by=popularity.desc";
            else endpoint += (endpoint.includes('?') ? '&' : '?') + "with_original_language=tr";
        }

        const sep = endpoint.includes('?') ? '&' : '?';
        const url = `${TMDB_BASE}${endpoint}${sep}api_key=${TMDB_KEY}&language=${langParam}&page=${page}`;
        fetch(url).then(r => r.json()).then(d => callback((d.results || []).map(parseTmdbItem))).catch(() => callback([]));
    }

    function performMovieSearch(q) {
        continueSection.style.display = 'none';
        gridLoader.style.display = 'block';
        moviesGrid.innerHTML = '';
        emptyState.style.display = 'none';
        catalogTitle.textContent = `🔍 ძებნა: "${q}"`;
        hasMorePages = false;

        const ql = q.toLowerCase();
        const localMatches = LOCAL_MOVIES.filter(m =>
            (m.title && m.title.toLowerCase().includes(ql)) ||
            (m.originalTitle && m.originalTitle.toLowerCase().includes(ql))
        );
        const langParam = currentLanguage === 'RUS' ? 'ru-RU' : (currentLanguage === 'ENG' ? 'en-US' : 'ka-GE');
        const url = `${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&language=${langParam}&query=${encodeURIComponent(q)}&page=1`;

        fetch(url).then(r => r.json()).then(data => {
            gridLoader.style.display = 'none';
            const tmdbMatches = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').map(parseTmdbItem);
            const seen = new Set();
            movies = [];
            localMatches.concat(tmdbMatches).forEach(item => {
                const key = item.tmdbId ? `tmdb_${item.tmdbId}` : (item.id || item.title);
                if (!seen.has(key)) { seen.add(key); movies.push(item); }
            });
            catalogCount.textContent = movies.length + " შედეგი";
            renderMovies(movies);
        }).catch(() => {
            gridLoader.style.display = 'none';
            movies = localMatches;
            catalogCount.textContent = movies.length + " შედეგი";
            renderMovies(movies);
        });
    }

    function parseTmdbItem(item) {
        return {
            id: "tmdb_" + item.id,
            tmdbId: item.id,
            title: item.title || item.name || "ფილმი",
            originalTitle: item.original_title || item.original_name || item.title || "",
            year: (item.release_date || item.first_air_date || "2024").substring(0, 4),
            rating: Number(item.vote_average || 7.5).toFixed(1),
            poster: item.poster_path ? (IMG_BASE + item.poster_path) : "icon.png",
            category: currentCategory,
            overview: item.overview || "ფილმის მოკლე შინაარსი...",
            isSeries: currentCategory === 'SERIES' || item.media_type === 'tv' || !!item.first_air_date
        };
    }

    function loadMoreMovies() {
        if (isLoadingMore || !hasMorePages || activeTab !== 'cinema' || searchQuery) return;
        isLoadingMore = true;
        currentMoviePage++;
        gridLoader.style.display = 'block';
        fetchMoviesPage(currentMoviePage, (newItems) => {
            isLoadingMore = false;
            gridLoader.style.display = 'none';
            if (newItems.length > 0) {
                const seen = new Set(movies.map(m => m.tmdbId ? `tmdb_${m.tmdbId}` : (m.id || m.title)));
                const filtered = newItems.filter(item => {
                    const k = item.tmdbId ? `tmdb_${item.tmdbId}` : (item.id || item.title);
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                });
                movies = movies.concat(filtered);
                catalogCount.textContent = movies.length + " ფილმი";
                appendMovieCards(filtered);
            } else hasMorePages = false;
        });
    }

    mainScroll.addEventListener('scroll', () => {
        if (activeTab === 'cinema' && !searchQuery) {
            if (mainScroll.scrollTop + mainScroll.clientHeight >= mainScroll.scrollHeight - 400) loadMoreMovies();
        }
    });

    function renderMovies(list) {
        moviesGrid.innerHTML = '';
        if (!list || list.length === 0) { emptyState.style.display = 'block'; return; }
        emptyState.style.display = 'none';
        appendMovieCards(list);
    }

    function appendMovieCards(list) {
        const frag = document.createDocumentFragment();
        list.forEach(movie => {
            const card = document.createElement('div');
            card.className = 'movie-card';
            card.innerHTML = `
                <div class="poster-wrap">
                    <img src="${movie.poster || 'icon.png'}" alt="" loading="lazy" onerror="this.src='icon.png'">
                    <span class="badge-rating">⭐ ${movie.rating || '7.5'}</span>
                    <span class="badge-year">${movie.year || ''}</span>
                </div>
                <div class="movie-title">${movie.title || ''}</div>
            `;
            card.addEventListener('click', () => openMovieSheet(movie));
            frag.appendChild(card);
        });
        moviesGrid.appendChild(frag);
    }

    // Movie Sheet
    let pendingResumeMs = 0;
    function openMovieSheet(movie, resumeMs) {
        selectedMovie = movie;
        selectedStreamIndex = 0;
        pendingResumeMs = resumeMs || 0;

        dlgPoster.src = movie.poster || 'icon.png';
        dlgTitle.textContent = movie.title || '';
        dlgYear.textContent = movie.year || '2024';
        dlgRating.textContent = "⭐ " + (movie.rating || '7.5');
        dlgLangBadge.textContent = movie.lang || 'ქართულად';
        dlgCatBadge.textContent = movie.isSeries ? '🍿 სერიალი' : '🎬 ფილმი';
        dlgDesc.textContent = movie.overview || "ფილმის მოკლე შინაარსი...";
        btnDlgPlay.textContent = pendingResumeMs > 5000 ? "▶️ გაგრძელება" : "▶️ ყურება";
        updateFavButton();

        sheetEpisodesWrap.style.display = 'none';
        dlgSourcesChips.innerHTML = '';
        const streams = (movie.streams || []).filter(s => s && s.url && !s.url.endsWith('.html'));
        if (streams.length > 0) {
            streams.forEach((s, idx) => {
                const chip = document.createElement('button');
                chip.className = 'source-chip' + (idx === 0 ? ' active' : '');
                chip.textContent = s.label || `სერვერი ${idx + 1}`;
                chip.addEventListener('click', () => {
                    selectedStreamIndex = idx;
                    dlgSourcesChips.querySelectorAll('.source-chip').forEach((c, i) => c.classList.toggle('active', i === idx));
                });
                dlgSourcesChips.appendChild(chip);
            });
        } else if (movie.isCavea && movie.caveaSlug) {
            dlgSourcesChips.innerHTML = '<span class="source-chip active">🍿 Cavea+ (უფასო HD)</span>';
        } else if (movie.okVideoId) {
            dlgSourcesChips.innerHTML = '<span class="source-chip active">🇬🇪 ქართულად (OK.ru HD)</span>';
        } else if (movie.embedUrl) {
            dlgSourcesChips.innerHTML = '<span class="source-chip active">🇬🇪 ქართულად (Embed HD)</span>';
        } else if (movie.tmdbId) {
            dlgSourcesChips.innerHTML = '<span class="source-chip active">🎬 HD სტრიმი (Kinoflix / Player)</span>';
        } else {
            dlgSourcesChips.innerHTML = '<span class="source-chip">⚠️ სტრიმი ვერ მოიძებნა</span>';
        }
        sheetBackdrop.classList.add('open');
    }

    function closeMovieSheet() { sheetBackdrop.classList.remove('open'); }
    btnSheetClose.addEventListener('click', closeMovieSheet);
    sheetBackdrop.addEventListener('click', (e) => { if (e.target === sheetBackdrop) closeMovieSheet(); });
    btnDlgFav.addEventListener('click', () => toggleFavorite(selectedMovie));

    btnDlgPlay.addEventListener('click', () => {
        if (!selectedMovie) return;
        if (selectedMovie.isCavea && selectedMovie.caveaSlug) {
            window.open('https://cavea.plus/ge/movies/' + selectedMovie.caveaSlug, '_blank');
            return;
        }
        const streams = (selectedMovie.streams || []).filter(s => s && s.url && !s.url.endsWith('.html'));
        if (streams.length > 0) {
            const chosen = streams[selectedStreamIndex] || streams[0];
            closeMovieSheet();
            playInPwaPlayer(chosen.url, selectedMovie.title, chosen.label || "FullHD", false, selectedMovie, pendingResumeMs);
        } else if (selectedMovie.okVideoId) {
            closeMovieSheet();
            playIframeInPwa(`https://ok.ru/videoembed/${selectedMovie.okVideoId}?autoplay=1`, selectedMovie.title, "🇬🇪 ქართულად • OK.ru");
        } else if (selectedMovie.embedUrl) {
            closeMovieSheet();
            playIframeInPwa(selectedMovie.embedUrl, selectedMovie.title, "🇬🇪 ქართულად • HD");
        } else if (selectedMovie.tmdbId) {
            closeMovieSheet();
            const kType = selectedMovie.isSeries ? 'serial' : 'movie';
            playIframeInPwa(`https://em.kinoflix.tv/embed/${kType}/${selectedMovie.tmdbId}?lang=ka`, selectedMovie.title, "🎬 HD სტრიმი");
        } else {
            alert("სამწუხაროდ ამ ფილმის სტრიმი ვერ მოიძებნა");
        }
    });

    function playIframeInPwa(iframeUrl, title, sub) {
        if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
        if (pwaIframe) { pwaIframe.style.display = 'none'; pwaIframe.src = 'about:blank'; }
        pwaVideo.style.display = 'block';
        pwaVideo.pause();
        pwaVideo.removeAttribute('src');
        pwaVideo.style.display = 'none';
        if (pwaIframe) {
            pwaIframe.style.display = 'block';
            pwaIframe.src = iframeUrl;
        }
        pwaPlayerTitle.textContent = title || "NEXTX Room";
        pwaPlayerSub.textContent = sub || "";
        pwaPlayerActions.innerHTML = '';
        pwaPlayerModal.classList.add('open');
    }

    // Live TV List
    function renderTvList() {
        let filtered = activeChannelGroup === 'ALL'
            ? ALL_CHANNELS
            : ALL_CHANNELS.filter(ch => ch.group === activeChannelGroup);
        if (searchQuery) {
            const ql = searchQuery.toLowerCase();
            filtered = filtered.filter(ch =>
                (ch.name && ch.name.toLowerCase().includes(ql)) ||
                (ch.group && ch.group.toLowerCase().includes(ql))
            );
        }
        tvCount.textContent = filtered.length + " არხი";
        tvList.innerHTML = '';
        const frag = document.createDocumentFragment();
        filtered.forEach((ch, idx) => {
            const row = document.createElement('div');
            row.className = 'tv-item';
            row.innerHTML = `
                <span class="tv-num">${idx + 1}</span>
                <img class="tv-logo" src="${ch.logo || 'icon.png'}" alt="" loading="lazy" decoding="async" onerror="this.src='icon.png'">
                <div class="tv-info">
                    <div class="tv-name">${ch.name}</div>
                    <div class="tv-group">${ch.group || ''}</div>
                </div>
                <span class="tv-play-pill">▶ LIVE</span>
            `;
            row.addEventListener('click', () => {
                const gIdx = ALL_CHANNELS.indexOf(ch);
                playChannelInPwa(gIdx >= 0 ? gIdx : 0);
            });
            frag.appendChild(row);
        });
        tvList.appendChild(frag);
    }

    function playChannelInPwa(globalIdx) {
        if (!ALL_CHANNELS[globalIdx]) return;
        currentChannelIdx = globalIdx;
        const ch = ALL_CHANNELS[globalIdx];
        playInPwaPlayer(ch.url, `${globalIdx + 1}. ${ch.name}`, "🔴 პირდაპირი ეთერი", true, null, 0);
    }

    function playInPwaPlayer(url, title, sub, isLive, movieObj, resumeMs) {
        if (location.protocol === 'https:' && url && url.startsWith('http://')) {
            url = url.replace('http://', 'https://');
        }
        currentPlayingMovie = movieObj;
        pwaPlayerTitle.textContent = title || "NEXTX Room";
        pwaPlayerSub.textContent = sub || "";
        pwaPlayerModal.classList.add('open');

        if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
        if (pwaIframe) { pwaIframe.style.display = 'none'; pwaIframe.src = 'about:blank'; }
        pwaVideo.style.display = 'block';
        pwaVideo.pause();
        pwaVideo.removeAttribute('src');

        const isHls = url.includes('.m3u8');
        if (isHls && pwaVideo.canPlayType('application/vnd.apple.mpegurl')) {
            // Native iOS Safari HLS
            pwaVideo.src = url;
            pwaVideo.addEventListener('loadedmetadata', function onMeta() {
                pwaVideo.removeEventListener('loadedmetadata', onMeta);
                if (resumeMs > 5000) pwaVideo.currentTime = resumeMs / 1000;
                pwaVideo.play().catch(() => {});
            });
        } else if (isHls && typeof Hls !== 'undefined' && Hls.isSupported()) {
            hlsInstance = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                maxBufferLength: 40,
                maxMaxBufferLength: 90,
                backBufferLength: 15,
                liveSyncDurationCount: 3,
                startFragPrefetch: true,
                fragLoadingMaxRetry: 4,
                manifestLoadingMaxRetry: 3
            });
            hlsInstance.loadSource(url);
            hlsInstance.attachMedia(pwaVideo);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                if (resumeMs > 5000) pwaVideo.currentTime = resumeMs / 1000;
                pwaVideo.play().catch(() => {});
            });
            let retriedFb = false;
            hlsInstance.on(Hls.Events.ERROR, (ev, data) => {
                if (data && data.fatal && isLive && !retriedFb) {
                    const ch = ALL_CHANNELS[currentChannelIdx];
                    const fb = ch && (ch.fallbackUrl || (url.startsWith('https://') ? url.replace('https://', 'http://') : null));
                    if (fb && fb !== url) {
                        retriedFb = true;
                        hlsInstance.loadSource(fb);
                    }
                }
            });
        } else {
            pwaVideo.src = url;
            if (resumeMs > 5000) {
                pwaVideo.addEventListener('loadedmetadata', function onMeta() {
                    pwaVideo.removeEventListener('loadedmetadata', onMeta);
                    pwaVideo.currentTime = resumeMs / 1000;
                });
            }
            pwaVideo.play().catch(() => {});
        }

        // Bottom player controls
        pwaPlayerActions.innerHTML = '';
        if (isLive) {
            const addBtn = (lbl, fn) => {
                const b = document.createElement('button');
                b.className = 'pwa-pill-btn';
                b.textContent = lbl;
                b.addEventListener('click', fn);
                pwaPlayerActions.appendChild(b);
            };
            addBtn('◄ წინა არხი', () => playChannelInPwa((currentChannelIdx - 1 + ALL_CHANNELS.length) % ALL_CHANNELS.length));
            addBtn('შემდეგი არხი ►', () => playChannelInPwa((currentChannelIdx + 1) % ALL_CHANNELS.length));
            const ch = ALL_CHANNELS[currentChannelIdx];
            if (ch && (ch.url.includes('/index.m3u8') || ch.url.includes('mono.m3u8'))) {
                [
                    { l: '◀ -15 წთ', s: 900 },
                    { l: '◀ -30 წთ', s: 1800 },
                    { l: '◀ -1 სთ', s: 3600 },
                    { l: '◀ -3 სთ', s: 10800 },
                    { l: '🔴 LIVE', s: 0 }
                ].forEach(p => {
                    addBtn(p.l, () => {
                        if (p.s === 0) { playChannelInPwa(currentChannelIdx); return; }
                        const targetUtc = Math.floor(Date.now() / 1000) - p.s;
                        const arch = ch.url.includes('/index.m3u8')
                            ? ch.url.replace(/\/index\.m3u8.*$/, `/timeshift_abs-${targetUtc}.m3u8`)
                            : ch.url.replace(/\/mono\.m3u8.*$/, `/timeshift_abs-${targetUtc}.m3u8`);
                        playInPwaPlayer(arch, `${currentChannelIdx + 1}. ${ch.name}`, `◀ არქივი (${p.l.replace('◀ ', '')})`, true, null, 0);
                    });
                });
            }
        }
    }

    btnPwaClose.addEventListener('click', () => {
        if (currentPlayingMovie && pwaVideo.currentTime > 5) {
            saveContinueItem(currentPlayingMovie, pwaVideo.currentTime, pwaVideo.duration);
        }
        if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
        if (pwaIframe) { pwaIframe.style.display = 'none'; pwaIframe.src = 'about:blank'; }
        pwaVideo.style.display = 'block';
        pwaVideo.pause();
        pwaVideo.removeAttribute('src');
        pwaPlayerModal.classList.remove('open');
    });

    // Init
    playIntroAnimation(2400);
    loadMoviesCatalog();
})();
