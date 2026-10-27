// ==========================================
// GESTOR DE CAPAS Y ELEMENTOS EN EL MAPA (layer-manager.js)
// ==========================================

const LayerManager = {
    // Almacén centralizado de capas activas
    activeLayers: {
        searchedPOIs: [], // PDI seleccionados tras la búsqueda
        externalTracks: [] // Preparado para futuros GPX / KML
    },
    activeMapMarkers: [], // Array para almacenar los markers visuales de MapLibre

    init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        // 1. Abrir panel de Gestor de Capas desde la tarjeta del Centro de Control
        const btnCard = document.getElementById("btn-layer-manager-card");
        if (btnCard) {
            btnCard.addEventListener("click", () => {
                document.getElementById("control-center-panel").classList.add("hidden");
                document.getElementById("layer-manager-panel").classList.remove("hidden");
                this.renderLayerManagerPanel();
            });
        }

        // 2. Botón volver desde el Gestor de Capas al mapa
        const btnBack = document.getElementById("btn-back-layer-manager");
        if (btnBack) {
            btnBack.addEventListener("click", () => {
                document.getElementById("layer-manager-panel").classList.add("hidden");
                // Asegurar que la barra general del visor esté visible al volver al mapa
                const bottomToolbar = document.getElementById("bottom-toolbar");
                if (bottomToolbar) bottomToolbar.classList.remove("hidden");
            });
        }

                // 3. Botón "Ver en el Mapa" desde el Gestor de PDI
        const btnViewOnMap = document.getElementById("btn-view-on-map");
        if (btnViewOnMap) {
            btnViewOnMap.addEventListener("click", () => {
                let selected = [];

                // 1. Buscar los checkboxes marcados en el DOM del gestor de PDI
                const checkedBoxes = document.querySelectorAll(".poi-select-checkbox:checked");
                
                if (checkedBoxes.length > 0) {
                    checkedBoxes.forEach(chk => {
                        const id = parseInt(chk.getAttribute("data-id"));
                        // Intentar buscar en el array global actual
                        let poiData = typeof currentNominatimElements !== 'undefined' 
                            ? currentNominatimElements.find(el => el.id === id) 
                            : null;

                        // Si no está en el array global, extraer los datos directamente de la tarjeta visual (DOM)
                        if (!poiData) {
                            const card = chk.closest(".node-card");
                            if (card) {
                                const name = card.querySelector(".node-name")?.textContent || "Punto sin nombre";
                                const metaText = card.querySelector(".node-meta")?.textContent || "";
                                // Intentar extraer lat/lon si están guardados o calcular aproximados del centro actual
                                poiData = {
                                    id: id,
                                    nombre: name,
                                    tags: { name: name },
                                    lat: typeof currentLat !== 'undefined' ? currentLat : 37.3414,
                                    lon: typeof currentLon !== 'undefined' ? currentLon : -5.9304
                                };
                            }
                        }

                        if (poiData) selected.push(poiData);
                    });
                }

                // Si no hay ninguna tarjeta marcada, mostrar aviso obligatorio y frenar
                if (selected.length === 0) {
                    alert("Por favor, selecciona al menos un PDI para ver en el mapa.");
                    if (typeof showToast === 'function') {
                        showToast("⚠️ Por favor, selecciona al menos un PDI");
                    }
                    return;
                }

                // Mapear de forma segura para el gestor de capas
                const formattedPOIs = selected.map(poi => ({
                    id: poi.id,
                    nombre: poi.tags && poi.tags.name ? poi.tags.name : (poi.nombre || "Punto sin nombre"),
                    categoria: poi.tags && (poi.tags.amenity || poi.tags.tourism || poi.tags.shop || poi.tags.natural || 'PDI'),
                    lat: poi.lat,
                    lon: poi.lon,
                    tags: poi.tags || {},
                    distancia: typeof calcularDistanciaKm === 'function' && typeof currentLat !== 'undefined' 
                        ? `${calcularDistanciaKm(currentLat, currentLon, poi.lat, poi.lon).toFixed(1)} km` 
                        : ''
                }));

                // Limpiar barra específica de Nominatim si existía
                const existingToolbar = document.getElementById("poi-map-toolbar");
                if (existingToolbar) existingToolbar.remove();

                // Mostrar la barra general del visor inferior
                const bottomToolbar = document.getElementById("bottom-toolbar");
                if (bottomToolbar) bottomToolbar.classList.remove("hidden");

                // Ocultar cursor central del mapa
                const mapCursor = document.getElementById("map-center-cursor");
                if (mapCursor) mapCursor.style.display = "none";

                // Cargamos en el gestor de capas y pintamos
                this.loadPOIsAsLayer(formattedPOIs);

                // Ocultamos el panel de resultados y volvemos al mapa
                document.getElementById("results-panel").style.display = "none";
            });
        }

        // 4. Botón "Listado" desde el panel inferior de detalle de PDI en el mapa
        const detailBtnAction = document.getElementById("detail-btn-action");
        if (detailBtnAction) {
            detailBtnAction.addEventListener("click", () => {
                document.getElementById("map-poi-detail-panel").style.display = "none";
                document.getElementById("layer-manager-panel").classList.remove("hidden");
                this.renderLayerManagerPanel();
            });
        }
    },

    // Cargar PDI como capa activa
    loadPOIsAsLayer(pois) {
        this.activeLayers.searchedPOIs = [...pois];
        this.renderLayerManagerPanel();
        this.paintMarkersOnMap();

        // Ajustar zoom del mapa para abarcar todos los puntos
        if (pois.length > 0 && typeof map !== 'undefined') {
            const bounds = new maplibregl.LngLatBounds();
            pois.forEach(p => bounds.extend([p.lon, p.lat]));
            map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 1200 });
        }
    },

    // Renderizar la lista en el panel de Gestor de Capas
    renderLayerManagerPanel() {
        const container = document.getElementById("layer-manager-nodes-container");
        const badge = document.getElementById("layer-manager-badge");
        if (!container) return;

        container.innerHTML = "";
        const total = this.activeLayers.searchedPOIs.length;
        if (badge) badge.innerText = total;

        if (total === 0) {
            container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 40px 20px;">No hay elementos activos en la capa del mapa.</p>`;
            return;
        }

        this.activeLayers.searchedPOIs.forEach((poi, index) => {
            const card = document.createElement("div");
            card.className = "poi-card-item";
            card.style.cssText = "background: var(--bg-card); border: 1px solid var(--border-color); padding: 12px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;";
            
            card.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; padding-right: 10px;">
                    <span style="font-size: 0.7rem; color: var(--primary-cyan); font-weight: bold; text-transform: uppercase;">${poi.categoria || 'PDI'}</span>
                    <strong style="color: var(--text-main); font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${poi.nombre}</strong>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${poi.distancia || ''}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                    <button class="btn-focus-poi" data-index="${index}" title="Centrar en el mapa" style="background: rgba(0,229,255,0.1); border: 1px solid var(--primary-cyan); border-radius: 8px; padding: 6px; cursor: pointer; display: flex; align-items: center;">
                        <img src="./ui-icons/fi-rr-location-arrow.svg" width="16" height="16" style="filter: brightness(0) saturate(100%) invert(77%) sepia(87%) saturate(1637%) hue-rotate(155deg) brightness(103%) contrast(101%);" alt="Centrar">
                    </button>
                    <button class="btn-delete-layer-item" data-index="${index}" title="Eliminar de la capa" style="background: rgba(231,76,60,0.1); border: 1px solid #e74c3c; border-radius: 8px; padding: 6px; cursor: pointer; display: flex; align-items: center;">
                        <img src="./ui-icons/fi-rr-trash.svg" width="16" height="16" style="filter: brightness(0) saturate(100%) invert(43%) sepia(93%) saturate(1352%) hue-rotate(334deg) brightness(97%) contrast(92%);" alt="Borrar">
                    </button>
                </div>
            `;

            card.querySelector(".btn-focus-poi").addEventListener("click", () => {
                this.focusOnPOI(poi);
            });

            card.querySelector(".btn-delete-layer-item").addEventListener("click", () => {
                this.removePOI(index);
            });

            container.appendChild(card);
        });
    },

    // Pintar los puntos utilizando marcadores idénticos a los del visor principal de PDI
    paintMarkersOnMap() {
        if (typeof map === 'undefined') return;

        // Limpiar marcadores anteriores
        this.activeMapMarkers.forEach(item => item.marker.remove());
        this.activeMapMarkers = [];

        this.activeLayers.searchedPOIs.forEach(poi => {
            const colorPin = typeof obtenerColorPorTag === 'function' ? obtenerColorPorTag(poi.tags) : '#00e5ff';

            const marker = new maplibregl.Marker({ color: colorPin })
                .setLngLat([poi.lon, poi.lat])
                .addTo(map);

            marker.getElement().addEventListener('click', (e) => {
                e.stopPropagation();
                this.showLayerItemDetail(poi);
            });

            this.activeMapMarkers.push({ id: poi.id, marker: marker, data: poi });
        });
    },

    // Centrar mapa en un PDI específico y abrir su detalle
    focusOnPOI(poi) {
        document.getElementById("layer-manager-panel").classList.add("hidden");
        
        const bottomToolbar = document.getElementById("bottom-toolbar");
        if (bottomToolbar) bottomToolbar.classList.remove("hidden");

        if (typeof map !== 'undefined') {
            map.flyTo({ center: [poi.lon, poi.lat], zoom: 16, duration: 1000 });
        }
        this.showLayerItemDetail(poi);
    },

    // Mostrar panel inferior de detalle del PDI garantizando la barra del visor general
    showLayerItemDetail(poi) {
        const detailPanel = document.getElementById("map-poi-detail-panel");
        if (!detailPanel) return;

        document.getElementById("detail-poi-category").innerText = poi.categoria || "PDI de Capa";
        document.getElementById("detail-poi-title").innerText = poi.nombre;
        document.getElementById("detail-poi-meta").innerText = `Lat: ${Number(poi.lat).toFixed(5)}, Lon: ${Number(poi.lon).toFixed(5)}`;
        
        detailPanel.style.display = "flex";

        // Asegurar que no quede la barra flotante de Nominatim
        const existingToolbar = document.getElementById("poi-map-toolbar");
        if (existingToolbar) existingToolbar.remove();

        // Asegurar que la barra inferior general del visor esté visible
        const bottomToolbar = document.getElementById("bottom-toolbar");
        if (bottomToolbar) bottomToolbar.classList.remove("hidden");

        // Configurar botón cerrar detalle (X) para que mantenga la barra general del visor
        document.getElementById("detail-btn-close").onclick = () => {
            detailPanel.style.display = "none";
            if (bottomToolbar) bottomToolbar.classList.remove("hidden");
        };

        // Configurar botón eliminar individual desde el detalle
        document.getElementById("detail-btn-delete").onclick = () => {
            const index = this.activeLayers.searchedPOIs.findIndex(p => p.lat === Number(poi.lat) && p.lon === Number(poi.lon));
            if (index !== -1) {
                this.removePOI(index);
                detailPanel.style.display = "none";
                if (bottomToolbar) bottomToolbar.classList.remove("hidden");
            }
        };
    },

    // Eliminar un PDI de la capa activa
    removePOI(index) {
        const removed = this.activeLayers.searchedPOIs.splice(index, 1)[0];
        
        if (removed) {
            const markerIndex = this.activeMapMarkers.findIndex(m => m.id === removed.id);
            if (markerIndex !== -1) {
                this.activeMapMarkers[markerIndex].marker.remove();
                this.activeMapMarkers.splice(markerIndex, 1);
            }
        }

        this.renderLayerManagerPanel();
        this.paintMarkersOnMap();

        if (this.activeLayers.searchedPOIs.length === 0) {
            const detailPanel = document.getElementById("map-poi-detail-panel");
            if (detailPanel) detailPanel.style.display = "none";
            const bottomToolbar = document.getElementById("bottom-toolbar");
            if (bottomToolbar) bottomToolbar.classList.remove("hidden");
        }
    }
};

// Inicializar al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
    LayerManager.init();
});
