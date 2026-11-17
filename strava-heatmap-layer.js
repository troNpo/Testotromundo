// ==========================================
// STRAVA-HEATMAP-LAYER.JS - Capa Raster Strava (Basada en especificación OruxMaps / Nakarte)
// ==========================================

const StravaHeatmapManager = {
    isEnabled: false,
    sport: "all",       // all, ride, run, winter
    color: "blue",      // blue, hot, purple, gray
    opacity: 0.85,
    sourceId: "strava-heatmap-source",
    layerId: "strava-heatmap-layer",

    init() {
        this.registerStravaProtocol();
        this.injectUIControls();
        this.setupMapListeners();
    },

    // Registra el protocolo personalizado replicando la URL de OruxMaps/Nakarte
    registerStravaProtocol() {
        if (typeof maplibregl === "undefined" || !maplibregl.addProtocol) return;

        maplibregl.addProtocol("orux-strava", async (params, abortController) => {
            // params.url formato: orux-strava://{sport}/{color}/{z}/{x}/{y}
            const cleanPath = params.url.replace("orux-strava://", "");
            const parts = cleanPath.split("/");
            if (parts.length < 5) throw new Error("Parámetros de tesela inválidos");

            const [sport, color, z, x, y] = parts;
            const servers = ["a", "b", "c"];
            const server = servers[(parseInt(x, 10) + parseInt(y, 10)) % servers.length];

            // URL oficial suministrada por el desarrollador de OruxMaps (vía proxy nakarte)
            const targetUrl = `https://proxy.nakarte.me/https/content-${server}.strava.com/identified/globalheat/${sport}/${color}/${z}/${x}/${y}.png?px=256`;

            try {
                const response = await fetch(targetUrl, {
                    signal: abortController.signal,
                    headers: {
                        "Referer": "https://nakarte.me/"
                    }
                });

                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    if (arrayBuffer && arrayBuffer.byteLength > 100) {
                        return { data: arrayBuffer };
                    }
                }
            } catch (err) {
                if (err.name === "AbortError") throw err;
            }

            // Si la tesela está vacía o da error, devolvemos un PNG transparente de 1x1 píxel
            const emptyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
            const binary = atob(emptyPngBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return { data: bytes.buffer };
        });
    },

    injectUIControls() {
        const mapsDrawerBody = document.querySelector("#side-panel-maps .side-drawer-body");
        if (!mapsDrawerBody || document.getElementById("strava-heatmap-card")) return;

        const container = document.createElement("div");
        container.id = "strava-heatmap-card";
        container.style.cssText = `
            margin-top: 14px;
            padding: 12px 14px;
            background: rgba(252, 76, 2, 0.08);
            border: 1.5px solid rgba(252, 76, 2, 0.45);
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            font-family: sans-serif;
        `;

        container.innerHTML = `
            <div id="strava-toggle-row" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-size: 0.88rem; font-weight: bold; color: #fc4c02;">🔥 Mapa de Calor Strava</span>
                    <span style="font-size: 0.72rem; color: #bbb;">OruxMaps Engine (Nakarte)</span>
                </div>
                <label class="switch" style="pointer-events: none;">
                    <input type="checkbox" id="toggle-strava-heatmap">
                    <span class="slider-round"></span>
                </label>
            </div>

            <div id="strava-controls-panel" style="display: none; flex-direction: column; gap: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                <div style="display: flex; gap: 6px;">
                    <select id="strava-sport-select" style="flex: 1; background: #121214; color: #fff; border: 1px solid rgba(252,76,2,0.4); border-radius: 8px; padding: 6px; font-size: 0.78rem; outline: none;">
                        <option value="all" selected>Todos</option>
                        <option value="run">Carrera / Trail</option>
                        <option value="ride">Ciclismo / MTB</option>
                        <option value="winter">Invierno</option>
                    </select>
                    <select id="strava-color-select" style="flex: 1; background: #121214; color: #fff; border: 1px solid rgba(252,76,2,0.4); border-radius: 8px; padding: 6px; font-size: 0.78rem; outline: none;">
                        <option value="blue" selected>Azul (Blue)</option>
                        <option value="hot">Fuego (Hot)</option>
                        <option value="purple">Púrpura</option>
                        <option value="gray">Gris</option>
                    </select>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.75rem; color: #ccc;">
                    <span>Opacidad:</span>
                    <input type="range" id="strava-opacity-slider" min="0.2" max="1" step="0.05" value="0.85" style="flex: 1; accent-color: #fc4c02; cursor: pointer;">
                    <span id="strava-opacity-val" style="min-width: 32px; text-align: right; color: #fc4c02; font-weight: bold;">85%</span>
                </div>
            </div>
        `;

        mapsDrawerBody.appendChild(container);

        const toggleRow = document.getElementById("strava-toggle-row");
        const checkbox = document.getElementById("toggle-strava-heatmap");
        const controlsPanel = document.getElementById("strava-controls-panel");
        const sportSelect = document.getElementById("strava-sport-select");
        const colorSelect = document.getElementById("strava-color-select");
        const opacitySlider = document.getElementById("strava-opacity-slider");
        const opacityVal = document.getElementById("strava-opacity-val");

        toggleRow?.addEventListener("click", () => {
            this.isEnabled = !this.isEnabled;
            if (checkbox) checkbox.checked = this.isEnabled;
            if (controlsPanel) controlsPanel.style.display = this.isEnabled ? "flex" : "none";

            if (this.isEnabled) {
                this.addOrUpdateLayer();
                window.RoutePlanner?.showToast?.("Capa Strava OruxMaps activada");
            } else {
                this.removeLayer();
                window.RoutePlanner?.showToast?.("Capa Strava desactivada");
            }
        });

        sportSelect?.addEventListener("change", (e) => {
            this.sport = e.target.value;
            if (this.isEnabled) this.addOrUpdateLayer();
        });

        colorSelect?.addEventListener("change", (e) => {
            this.color = e.target.value;
            if (this.isEnabled) this.addOrUpdateLayer();
        });

        opacitySlider?.addEventListener("input", (e) => {
            this.opacity = parseFloat(e.target.value);
            if (opacityVal) opacityVal.innerText = `${Math.round(this.opacity * 100)}%`;
            const mapObj = window.map;
            if (mapObj && mapObj.getLayer(this.layerId)) {
                mapObj.setPaintProperty(this.layerId, "raster-opacity", this.opacity);
            }
        });
    },

    setupMapListeners() {
        const waitForMap = setInterval(() => {
            const mapObj = window.map;
            if (mapObj && typeof mapObj.on === "function") {
                clearInterval(waitForMap);
                mapObj.on("style.load", () => {
                    if (this.isEnabled) {
                        setTimeout(() => this.addOrUpdateLayer(), 150);
                    }
                });
            }
        }, 150);
    },

    getBeforeLayerId(mapObj) {
        const layers = mapObj.getStyle()?.layers || [];
        for (const layer of layers) {
            if (
                layer.id.startsWith("active-segment-") ||
                layer.id.startsWith("inactive-alt-") ||
                layer.id === "planned-route-arrows" ||
                layer.id === "cursor-helper-layer"
            ) {
                return layer.id;
            }
        }
        return undefined;
    },

    addOrUpdateLayer() {
        const mapObj = window.map;
        if (!mapObj) return;

        this.removeLayer();

        const tileUrl = `orux-strava://${this.sport}/${this.color}/{z}/{x}/{y}`;

        mapObj.addSource(this.sourceId, {
            type: "raster",
            tiles: [tileUrl],
            tileSize: 256,
            minzoom: 1,
            maxzoom: 16,
            attribution: "© Strava (Nakarte / OruxMaps)"
        });

        const beforeId = this.getBeforeLayerId(mapObj);

        mapObj.addLayer(
            {
                id: this.layerId,
                type: "raster",
                source: this.sourceId,
                paint: {
                    "raster-opacity": this.opacity,
                    "raster-fade-duration": 150
                }
            },
            beforeId
        );
    },

    removeLayer() {
        const mapObj = window.map;
        if (!mapObj) return;
        try {
            if (mapObj.getLayer(this.layerId)) mapObj.removeLayer(this.layerId);
            if (mapObj.getSource(this.sourceId)) mapObj.removeSource(this.sourceId);
        } catch (e) {}
    }
};

window.StravaHeatmapManager = StravaHeatmapManager;
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => StravaHeatmapManager.init());
} else {
    StravaHeatmapManager.init();
}
