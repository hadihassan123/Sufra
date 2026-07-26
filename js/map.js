 let map = null;
  let markers = [];
  const AREA_COORDS = {
    'Lusail': [25.40, 51.50],
    'West Bay': [25.32, 51.53],
    'Doha Jadeed': [25.28, 51.53],
    'Al Sadd': [25.28, 51.50],
    'Msheireb': [25.28, 51.52],
    'Pearl Qatar': [25.37, 51.55],
    'al Wakrah': [25.17, 51.60]
  };


  function renderMap(listings) {
    if (!map) {
        map = L.map('mapView');

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);
    }

    // Remove previous markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    listings.forEach(l => {

        let coords;

        // 1. Use vendor GPS coordinates if available
        if (
            l.vendors?.latitude != null &&
            l.vendors?.longitude != null
        ) {
            coords = [
                Number(l.vendors.latitude),
                Number(l.vendors.longitude)
            ];
        }

        // 2. Otherwise use area coordinates
        else {
            const area = (l.vendors?.area || '').trim();
            coords = AREA_COORDS[area] || [25.2854, 51.5310];
        }

        const popupContent = `
            <div style="font-family:sans-serif;min-width:150px;">
                <strong style="display:block;margin-bottom:4px;">
                    ${l.item_name}
                </strong>

                <span style="font-size:0.85em;color:#666;">
                    ${l.vendors?.business_name}
                </span>

                <br>

                <span style="font-weight:bold;color:#2F6E67;">
                    ${money(l.discounted_price)}
                </span>

                <button
                    class="btn btn-teal btn-sm"
                    style="width:100%;margin-top:8px;"
                    onclick="openReserveModal('${l.id}')">
                    Reserve
                </button>
            </div>
        `;

        const marker = L.marker(coords)
            .addTo(map)
            .bindPopup(popupContent);

        markers.push(marker);
    });

    // Automatically fit all markers
    if (markers.length) {
        const group = L.featureGroup(markers);

        map.fitBounds(group.getBounds(), {
            padding: [40, 40]
        });
    }

    // Fix rendering when map was initially hidden
    setTimeout(() => {
        map.invalidateSize();
    }, 100);
}
        
 
