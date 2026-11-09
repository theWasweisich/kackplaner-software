
$TARGET_URL = "192.168.178.100:8050"

chromium \
	--kiosk \
	--noerrdialogs \
	--disable-infobars \
        --no-first-run \
        --incognito \
        --ozone-platform=wayland \
        --enable-features=OverlayScrollbar \
        --check-for-update-interval=31536000 \
        --disk-cache-dir=/dev/null \
        $1
