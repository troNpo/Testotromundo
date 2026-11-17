// ==========================================
// STRAVA-HEATMAP-LAYER.JS - Capa Raster Strava (Parseo directo XML de OruxMaps)
// ==========================================

const StravaHeatmapManager = {
    isEnabled: false,
    opacity: 0.85,
    sourceId: "strava-heatmap-source",
    layerId: "strava-heatmap-layer",
    xmlTemplate: "",

    init() {
        this.loadOruxXmlDefinition();
        this.registerStravaProtocol();
        this.injectUIControls();
        this.setupMapListeners();
    },

    // Definición XML exacta proporcionada por OruxMaps
    loadOruxXmlDefinition() {
        this.xmlTemplate = `
        <onlinemapsource uid="2001">
        <name>🌐 Strava All Blue (STRAVA)</name>
        <url><![CDATA[https://proxy.nakarte.me/https/content-{$s}.strava.com/identified/globalheat/all/blue/{$z}/{$x}/{$y}.png?px=256]]></url>
        <website><![CDATA[<font color="#000000">©Strava All Blue</font>]]></website>
        <minzoom>1</minzoom>
        <maxzoom>16</maxzoom>
        <servers>a,b,c</servers>
        <projection>MERCATORESFERICA</projection>
        <httpparam name="User-Agent">{om}</httpparam>
        <httpparam name="Referer">https://nakarte.me/</httpparam>
        <cacheable>1</cacheable>
        <downloadable>1</downloadable>
        </onlinemapsource>
        `;
    },

    registerStravaProtocol() {
        if (typeof maplibregl === "undefined" || !maplibregl.addProtocol) return;

        maplibregl.addProtocol("orux-xml-strava", async (params, abortController) => {
            // params.url formato: orux-xml-strava://{z}/{x}/{y}
            const cleanPath = params.url.replace("orux-xml-strava://", "");
            const parts = cleanPath.split("/");
            if (parts.length < 3) throw new Error("Parámetros de tesela inválidos");

            const [z, x, y] = parts;
            const servers = ["a", "b", "c"];
            const server = servers[(parseInt(x, 10) + parseInt(y, 10)) % servers.length];

            // Extraemos la URL base del XML parseado y sustituimos las variables de MapLibre y OruxMaps
            let parsedUrl = "https://proxy.nakarte.me/https/content-{$s}.strava.com/identified/globalheat/all/blue/{$z}/{$x}/{$y}.png?px=256";
            
            const match = this.xmlTemplate.match(/<url><!\[CDATA\[(.*?)\]\]><\/url>/);
            if (match && match[1]) {
                parsedUrl = match[1].trim();
            }

            const targetUrl = parsedUrl
                .replace("{$s}", server)
                .replace("{$z}", z)
                .replace("{$x}", x)
                .replace("{$y}", y);

            try {
                // Petición a través de un proxy CORS abierto para respetar el Referer o petición directa
                const response = await fetch(`https://corsproxy.io/?` + encodeURIComponent(targetUrl), {
                    signal: abortController.signal,
                    headers: {
                        "X-Requested-With": "OtroMundo-OruxParser"
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

            // PNG transparente de 1x1 píxel por defecto si la tesela no responde
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
                    <span style="font-size: 0.72rem; color: #bbb;">Parser XML OruxMaps (uid="2001")</span>
                </div>
                <label class="switch" style="pointer-events: none;">
                    <input type="checkbox" id="toggle-strava-heatmap">
                    <span class="slider-round"></span>
                </label>
            </div>

            <div id="strava-controls-panel" style="display: none; flex-direction: column; gap: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
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
        const opacitySlider = document.getElementById("strava-opacity-slider");
        const opacityVal = document.getElementById("strava-opacity-val");

        toggleRow?.addEventListener("click", () => {
            this.isEnabled = !this.isEnabled;
            if (checkbox) checkbox.checked = this.isEnabled;
            if (controlsPanel) controlsPanel.style.display = this.isEnabled ? "flex" : "none";

            if (this.isEnabled) {
                this.addOrUpdateLayer();
                window.RoutePlanner?.showToast?.("Capa Strava XML activada");
            } else {
                this.removeLayer();
                window.RoutePlanner?.showToast?.("Capa Strava desactivada");
            }
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

        const tileUrl = `orux-xml-strava://{z}/{x}/{y}`;

        mapObj.addSource(this.sourceId, {
            type: "raster",
            tiles: [tileUrl],
            tileSize: 256,
            minzoom: 1,
            maxzoom: 16,
            attribution: "© Strava OruxMaps XML (uid=2001)"
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
