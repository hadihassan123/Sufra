let map = null;
let markers = [];

const AREA_COORDS = {
    "lusail": [25.40, 51.50],
    "west Bay": [25.32, 51.53],
    "doha Jadeed": [25.28, 51.53],
    "al Sadd": [25.28, 51.50],
    "msheireb": [25.28, 51.52],
    "pearl Qatar": [25.37, 51.55],
    "al Wakrah": [25.17, 51.60]
};

function rendermap({ listings, reserveHandler }) {

    if (!map) {
        map = L.map("mapView");

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap"
        }).addTo(map);
    }

    // Remove previous markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    listings.forEach(l => {

        let coords;

        // 1. Exact GPS coordinates
        if (
            l.vendors?.latitude != null &&
            l.vendors?.longitude != null
        ) {
            coords = [
                Number(l.vendors.latitude),
                Number(l.vendors.longitude)
            ];
        }

        // 2. Fallback to area coordinates
        else {
            const area = (l.vendors?.area || "")
                .toLowerCase()
                .trim();
            coords = AREA_COORDS[area] || [25.2854, 51.5310];
        }

        const popupContent = `
            <div style="font-family:sans-serif;min-width:150px;">
                <strong style="display:block;margin-bottom:4px;">
                    ${l.item_name}
                </strong>

                <span style="font-size:0.85em;color:#666;">
                    ${l.vendors?.business_name || ""}
                </span>

                <br>

                <span style="font-weight:bold;color:#2F6E67;">
                    QAR ${Number(l.discounted_price).toFixed(0)}
                </span>

                <button
                    class="btn btn-teal btn-sm"
                    style="width:100%;margin-top:8px;"
                    onclick="window.openReserveModal('${l.id}')">
                    Reserve
                </button>
            </div>
        `;

        const marker = L.marker(coords)
            .addTo(map)
            .bindPopup(popupContent);

        markers.push(marker);
    });

    // Zoom to all markers
    if (markers.length) {
        const group = L.featureGroup(markers);

        map.fitBounds(group.getBounds(), {
            padding: [40, 40]
        });
    }

    // Fix hidden map rendering
    setTimeout(() => {
        map.invalidateSize();
    }, 100);
}

// Public API
window.mapView = {
    render: renderMap
};