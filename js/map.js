let map = null;
let markers = [];

const AREA_COORDS = {
    "lusail": [25.40, 51.50],
    "west bay": [25.32, 51.53],
    "doha jadeed": [25.28, 51.53],
    "al sadd": [25.28, 51.50],
    "msheireb": [25.28, 51.52],
    "pearl qatar": [25.37, 51.55],
    "al wakrah": [25.17, 51.60]
};

function rendermap({ listings, reserveHandler }) {
    console.log("Map listings:", listings);
    console.log("Count:", listings.length);

    if (!map) {
        setTimeout(() => {
            map = L.map("mapView");

            window.map = map;

            L.tileLayer(
                "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                    attribution: "© OpenStreetMap"
                }
            ).addTo(map);

            map.setView([25.2854, 51.5310], 12);

            finishRender(listings);
        }, 0);

        return;
    }

    // Remove previous markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    console.log("Map listings:", listings);
    console.log("Listings count:", listings.length);
    
    listings.forEach(l => {

        console.log("Vendor:", l.vendors);
        console.log("Lat:", l.vendors?.latitude);
        console.log("Lng:", l.vendors?.longitude);
        console.log("Area:", l.vendors?.area);

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

            console.log("GPS", coords);
        }

        // 2. Fallback to area coordinates
        else {
            const area = (l.vendors?.area || "")
                .toLowerCase()
                .trim();
            coords = AREA_COORDS[area] || [25.2854, 51.5310];

            console.log("AREA", area, coords);
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
        console.log("Marker added");
    });
    console.log("Markers:", markers.length);

    // Zoom to all markers
    if (markers.length) {
        const group = L.featureGroup(markers);

        map.fitBounds(group.getBounds(), {
            padding: [40, 40]
        });
    }

    // Fix hidden map rendering
    setTimeout(() => {
        map.invalidateSize(true);

        if (markers.length) {
            const group = L.featureGroup(markers);
            map.fitBounds(group.getBounds(), {
                padding: [40, 40]
            });
        }
    }, 200);
}

// Public API
window.mapView = {
    render: rendermap
};