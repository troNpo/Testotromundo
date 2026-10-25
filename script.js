// script.js

// 1. Cargar preferencias guardadas en localStorage apuntando a la carpeta styles/
const savedStyle = localStorage.getItem('otromundo_style') || 'styles/osm.json';
const savedCursorShow = localStorage.getItem('otromundo_cursor_show') !== 'false';
const savedCursorSize = localStorage.getItem('otromundo_cursor_size') || '75';
const savedPitch = localStorage.getItem('otromundo_pitch') || '0';

// 2. Inicialización del mapa con MapLibre GL JS
const map = new maplibregl.Map({
    container: 'map',
    style: savedStyle, 
    center: [-5.9304, 37.3414], // Montequinto / Sevilla
    zoom: 12,
    pitch: parseFloat(savedPitch),
    attributionControl: false
});

// Control de geolocalización
const geolocateControl = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserLocation: true
});
map.addControl(geolocateControl);

// --- LÓGICA DEL PANEL DESLIZANTE DE MAPAS Y BARRA INFERIOR ---
const btnMap = document.getElementById('btn-map');
const btnBack = document.getElementById('btn-back');
const modalSelector = document.getElementById('layer-selector-modal');
const bottomToolbar = document.getElementById('bottom-toolbar');

btnMap?.addEventListener('click', () => {
    const selectStyle = document.getElementById('select-style');
    const currentStyle = selectStyle ? selectStyle.value : savedStyle;
    const layerRadios = document.querySelectorAll('#layer-selector-modal input[type="radio"]');
    
    layerRadios.forEach(radio => {
        if (currentStyle.includes(radio.value) || radio.value === currentStyle) {
            radio.checked = true;
        }
    });

    modalSelector.classList.add('active');
    
    const poiToolbar = document.getElementById('poi-map-toolbar');
    if (!poiToolbar) {
        bottomToolbar.classList.add('hidden');
    }
});

function closeLayerSelector() {
    modalSelector.classList.remove('active');
    
    const poiToolbar = document.getElementById('poi-map-toolbar');
    if (!poiToolbar) {
        bottomToolbar.classList.remove('hidden');
    }
}

btnBack?.addEventListener('click', closeLayerSelector);

const layerRadios = document.querySelectorAll('#layer-selector-modal input[type="radio"]');
layerRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        const selectedStyle = e.target.value;
        map.setStyle(selectedStyle);
        
        const selectStyle = document.getElementById('select-style');
        if (selectStyle) {
            selectStyle.value = selectedStyle;
        }

        const poiToolbar = document.getElementById('poi-map-toolbar');
        if (poiToolbar && bottomToolbar) {
            bottomToolbar.classList.add('hidden');
        }
    });
});

// --- LÓGICA DE LA BARRA INFERIOR (GPS y Zoom) ---
const btnGps = document.getElementById('btn-gps');
const gpsIcon = document.getElementById('gps-icon');
let isGpsActive = false;

btnGps?.addEventListener('click', () => {
    isGpsActive = !isGpsActive;
    if (isGpsActive) {
        gpsIcon.src = 'ui/fi-rr-location-crosshairs.svg';
        geolocateControl.trigger();
    } else {
        gpsIcon.src = 'ui/fi-rr-location-crosshairs-slash.svg';
    }
});

document.getElementById('btn-zoomin')?.addEventListener('click', () => {
    map.zoomIn({ duration: 300 });
});

document.getElementById('btn-zoomout')?.addEventListener('click', () => {
    map.zoomOut({ duration: 300 });
});

// --- LÓGICA DEL CENTRO DE CONTROL Y AJUSTES ---
const btnMenu = document.getElementById('btn-menu');
const btnClosePanel = document.getElementById('btn-close-panel');
const controlCenterPanel = document.getElementById('control-center-panel');
const btnSaveSettings = document.getElementById('btn-save-settings');

btnMenu?.addEventListener('click', () => {
    if (controlCenterPanel) controlCenterPanel.classList.remove('hidden');
    if (bottomToolbar) bottomToolbar.classList.add('hidden');
});

btnClosePanel?.addEventListener('click', () => {
    if (controlCenterPanel) controlCenterPanel.classList.add('hidden');
    if (bottomToolbar) bottomToolbar.classList.remove('hidden');
});

// --- GESTIÓN DE ATRIBUCIONES DESDE JSON Y PAYPAL ---
document.addEventListener("DOMContentLoaded", () => {
    initAttributionsAndDonation();
});

function initAttributionsAndDonation() {
    const btnAttributions = document.getElementById("btn-open-attributions");
    const panelAttributions = document.getElementById("attributions-panel");
    const btnCloseAttributions = document.getElementById("btn-close-attributions");
    const containerBody = document.getElementById("attributions-container-body");

    let attributionsLoaded = false;

    if (btnAttributions && panelAttributions) {
        btnAttributions.addEventListener("click", async (e) => {
            e.preventDefault();
            panelAttributions.classList.remove("hidden");

            if (!attributionsLoaded && containerBody) {
                try {
                    const response = await fetch("attributions.json");
                    const data = await response.json();
                    
                    let htmlContent = `
                        <p style="font-size: 0.9rem; color: #ccc; line-height: 1.5; margin: 0;">
                            <strong style="color: var(--primary-cyan);">Otro Mundo 🌎</strong> se nutre del esfuerzo de la comunidad global del software libre y los datos abiertos. Agradecemos profundamente el trabajo de los siguientes proyectos:
                        </p>
                    `;

                    data.forEach(item => {
                        htmlContent += `
                            <div class="control-card" style="border-radius: 12px; background: rgba(18,18,20,0.8); border: 1px solid rgba(0,229,255,0.2); padding: 14px; flex-direction: column; align-items: flex-start; gap: 6px;">
                                <div style="font-weight: bold; color: var(--primary-cyan); font-size: 1rem;">${item.title}</div>
                                <div style="font-size: 0.85rem; color: #aaa; line-height: 1.4;">${item.description}</div>
                                ${item.link ? `<a href="${item.link}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-cyan); font-size: 0.8rem; text-decoration: underline; margin-top: 4px;">${item.linkText}</a>` : ''}
                            </div>
                        `;
                    });

                    containerBody.innerHTML = htmlContent;
                    attributionsLoaded = true;
                } catch (error) {
                    containerBody.innerHTML = `<p style="color: #e74c3c; text-align: center;">Error al cargar las atribuciones.</p>`;
                }
            }
        });
    }

    if (btnCloseAttributions && panelAttributions) {
        btnCloseAttributions.addEventListener("click", () => {
            panelAttributions.classList.add("hidden");
        });
    }

    // Botón de Donación con PayPal
    const btnDonation = document.getElementById("btn-open-donation");
    if (btnDonation) {
        btnDonation.addEventListener("click", (e) => {
            e.preventDefault();
            const paypalUrl = "https://www.paypal.com/donate?hosted_button_id=TU_ID_DE_PAYPAL"; 
            window.open(paypalUrl, '_blank');
        });
    }
}

// Función global para acordeón
window.toggleAccordion = function(headerElement) {
    const card = headerElement.closest('.card-accordion');
    if (!card) return;
    
    card.classList.toggle('open');
    card.classList.toggle('expanded');

    const content = card.querySelector('.accordion-content');
    if (content) {
        if (card.classList.contains('open') || card.classList.contains('expanded')) {
            content.style.maxHeight = content.scrollHeight + "px";
        } else {
            content.style.maxHeight = null;
        }
    }
};

// Controles de Ajustes
const cursorContainer = document.getElementById('map-center-cursor');
const toggleCursor = document.getElementById('toggle-cursor');
const rangeCursorSize = document.getElementById('range-cursor-size');
const sizeValSpan = document.getElementById('size-val');

const rangePitch = document.getElementById('range-pitch');
const pitchValSpan = document.getElementById('pitch-val');
const selectStyle = document.getElementById('select-style');

if (toggleCursor) toggleCursor.checked = (savedCursorShow === true || savedCursorShow === 'true');
if (cursorContainer) {
    cursorContainer.style.display = toggleCursor?.checked ? 'block' : 'none';
    cursorContainer.style.width = savedCursorSize + 'px';
    cursorContainer.style.height = savedCursorSize + 'px';
}

if (rangeCursorSize) {
    rangeCursorSize.value = savedCursorSize;
    if (sizeValSpan) sizeValSpan.textContent = savedCursorSize;
}

if (rangePitch) {
    rangePitch.value = savedPitch;
    if (pitchValSpan) pitchValSpan.textContent = savedPitch;
}

if (selectStyle) {
    selectStyle.value = savedStyle;
}

toggleCursor?.addEventListener('change', (e) => {
    if (cursorContainer) cursorContainer.style.display = e.target.checked ? 'block' : 'none';
});

rangeCursorSize?.addEventListener('input', (e) => {
    const val = e.target.value;
    if (sizeValSpan) sizeValSpan.textContent = val;
    if (cursorContainer) {
        cursorContainer.style.width = val + 'px';
        cursorContainer.style.height = val + 'px';
    }
});

rangePitch?.addEventListener('input', (e) => {
    const pitchVal = parseFloat(e.target.value);
    if (pitchValSpan) pitchValSpan.textContent = pitchVal;
    map.setPitch(pitchVal);
});

selectStyle?.addEventListener('change', (e) => {
    const newStyle = e.target.value;
    map.setStyle(newStyle);
});

if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', () => {
        localStorage.setItem('otromundo_style', selectStyle.value);
        localStorage.setItem('otromundo_cursor_show', toggleCursor.checked);
        localStorage.setItem('otromundo_cursor_size', rangeCursorSize.value);
        localStorage.setItem('otromundo_pitch', rangePitch.value);
        showToast('¡Ajustes guardados correctamente!');
    });
}

// Botón flotante de recentrado GPS
const btnRecenter = document.getElementById('btn-recenter');
let userMovedMapManually = false;

map.on('movestart', (e) => {
    if (e.originalEvent && isGpsActive) {
        userMovedMapManually = true;
        btnRecenter?.classList.remove('hidden');
    }
});

btnRecenter?.addEventListener('click', () => {
    if (isGpsActive) {
        geolocateControl.trigger();
        userMovedMapManually = false;
        btnRecenter.classList.add('hidden');
    }
});

btnGps?.addEventListener('click', () => {
    setTimeout(() => {
        if (!isGpsActive && btnRecenter) {
            userMovedMapManually = false;
            btnRecenter.classList.add('hidden');
        }
    }, 50);
});

// --- NAVEGACIÓN DESDE EL CENTRO DE CONTROL AL PANEL DE POIS ---
const btnPoiCard = document.getElementById('btn-poi-card');
const poiFullscreenPanel = document.getElementById('poi-fullscreen-panel');
const btnBackToControl = document.getElementById('btn-back-to-control');

if (btnPoiCard && poiFullscreenPanel) {
    btnPoiCard.addEventListener('click', () => {
        controlCenterPanel.classList.add('hidden');    
        poiFullscreenPanel.classList.remove('hidden'); 
    });
}

if (btnBackToControl && poiFullscreenPanel) {
    btnBackToControl.addEventListener('click', () => {
        poiFullscreenPanel.classList.add('hidden');    
        controlCenterPanel.classList.remove('hidden'); 
    });
}
