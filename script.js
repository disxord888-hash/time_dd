document.addEventListener("DOMContentLoaded", () => {
    const periodFullNameEl = document.getElementById("periodFullName");
    const emojiEl = document.getElementById("emoji");
    const timeShortEl = document.getElementById("timeShort");
    const timeHoursEl = document.getElementById("timeHours");
    const timeMinutesEl = document.getElementById("timeMinutes");
    const timeSecondsEl = document.getElementById("timeSeconds");
    const stdTimeEl = document.getElementById("stdTime");
    const bgOverlay = document.getElementById("backgroundOverlay");

    let currentPeriodClass = "";
    let fallbackMode = false;
    let timeOffsetMs = 0; // Network synchronized time offset

    // Static periods fallback mapping
    // 32-hour system timeline where 9:00 = 9.0, 0:00 = 24.0, 8:59 = 32.99
    const fallbackPeriods = [
        { id: "forenoon", emoji: "🌞", short: "Fo", full: "FoRENOON", val32: 9 },
        { id: "midday", emoji: "🍭", short: "Mi", full: "MiDDAY", val32: 12 },
        { id: "evening", emoji: "🌇", short: "Ev", full: "EvENING", val32: 15 },
        { id: "night", emoji: "🌙", short: "Ni", full: "NiGHT", val32: 20 },
        { id: "overnight", emoji: "🌃", short: "Ov", full: "OvERNIGHT", val32: 25 },
        { id: "morning", emoji: "🌅", short: "Mo", full: "MoRNING", val32: 29 }
    ];

    let dynamicPeriods = null;

    function to32h(dateObj) {
        let h = dateObj.getHours();
        let m = dateObj.getMinutes();
        let s = dateObj.getSeconds();
        let val = h + m / 60 + s / 3600;
        if (h < 9) {
            val += 24;
        }
        return val;
    }

    function calculateDynamicTimes(results) {
        const d_sunrise = new Date(results.sunrise);
        const d_sunset = new Date(results.sunset);
        const d_noon = new Date(results.solar_noon);

        const t_sunrise = d_sunrise.getTime();
        const t_sunset = d_sunset.getTime();
        const t_noon = d_noon.getTime();

        dynamicPeriods = [
            { id: "morning", emoji: "🌅", short: "Mo", full: "MoRNING", val32: to32h(new Date(t_sunrise)) },
            { id: "forenoon", emoji: "🌞", short: "Fo", full: "FoRENOON", val32: to32h(new Date(t_sunrise + (t_noon - t_sunrise) / 2)) },
            { id: "midday", emoji: "🍭", short: "Mi", full: "MiDDAY", val32: to32h(new Date(t_noon)) },
            { id: "evening", emoji: "🌇", short: "Ev", full: "EvENING", val32: to32h(new Date(t_noon + (t_sunset - t_noon) / 2)) },
            { id: "night", emoji: "🌙", short: "Ni", full: "NiGHT", val32: to32h(new Date(t_sunset)) },
            // Overnight starts halfway between sunset and tomorrow's sunrise
            { id: "overnight", emoji: "🌃", short: "Ov", full: "OvERNIGHT", val32: to32h(new Date(t_sunset + ((t_sunrise + 86400000) - t_sunset) / 2)) }
        ];

        // Ensure chronological order
        dynamicPeriods.sort((a, b) => a.val32 - b.val32);
    }

    function initGeolocation() {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(async position => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                try {
                    const res = await fetch(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0`);
                    const data = await res.json();
                    if (data.status === "OK" || data.results) {
                        calculateDynamicTimes(data.results);
                        fallbackMode = false;
                    } else {
                        fallbackMode = true;
                    }
                } catch (e) {
                    fallbackMode = true;
                }
            }, () => {
                // Permission denied or error
                fallbackMode = true;
            });
        } else {
            fallbackMode = true;
        }
    }

    function getTextPeriodInfo(currentVal32) {
        const periods = fallbackPeriods;
        for (let i = periods.length - 1; i >= 0; i--) {
            if (currentVal32 >= periods[i].val32) {
                return periods[i];
            }
        }
        return periods[periods.length - 1];
    }

    function getColorPeriodInfo(currentVal32) {
        if (!dynamicPeriods) return null;
        const periods = dynamicPeriods;
        for (let i = periods.length - 1; i >= 0; i--) {
            if (currentVal32 >= periods[i].val32) {
                return periods[i];
            }
        }
        return periods[periods.length - 1];
    }

    function updateClock() {
        // Use dynamically synced network time + 250ms manual offset
        const now = new Date(Date.now() + timeOffsetMs + 250);
        const stdHour = now.getHours();
        const minute = now.getMinutes();
        const second = now.getSeconds();

        let hour32 = stdHour;
        if (stdHour < 9) {
            hour32 = stdHour + 24;
        }

        const currentVal32 = to32h(now);
        const textInfo = getTextPeriodInfo(currentVal32);
        const colorInfo = getColorPeriodInfo(currentVal32);

        const pad = n => n.toString().padStart(2, '0');

        // Update DOM text
        if (periodFullNameEl.textContent !== textInfo.full) periodFullNameEl.textContent = textInfo.full;
        if (emojiEl.textContent !== textInfo.emoji) emojiEl.textContent = textInfo.emoji;
        if (timeShortEl.textContent !== textInfo.short) timeShortEl.textContent = textInfo.short;
        
        timeHoursEl.textContent = pad(hour32);
        timeMinutesEl.textContent = pad(minute);
        timeSecondsEl.textContent = pad(second);

        // Update standard time display
        stdTimeEl.textContent = `${pad(stdHour)}:${pad(minute)}:${pad(second)}`;

        // Update Background (Use fallback sequential animation or dynamic period theme)
        let targetClass = "fallback";
        if (!fallbackMode && colorInfo) {
            targetClass = colorInfo.id;
        }
        
        if (currentPeriodClass !== targetClass) {
            if (currentPeriodClass) {
                bgOverlay.classList.remove(currentPeriodClass);
            }
            bgOverlay.classList.add(targetClass);
            currentPeriodClass = targetClass;
        }
    }

    async function syncNetworkTime() {
        try {
            const start = performance.now();
            const res = await fetch("https://timeapi.io/api/Time/current/zone?timeZone=UTC");
            if (res.ok) {
                const data = await res.json();
                const end = performance.now();
                const rtt = end - start;
                const realTimeObj = new Date(data.dateTime + "Z");
                timeOffsetMs = realTimeObj.getTime() + (rtt / 2) - Date.now();
            }
        } catch (e) {
            try {
                // Secondary fallback
                const res = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC");
                if (res.ok) {
                    const data = await res.json();
                    const realTimeMs = new Date(data.datetime).getTime();
                    timeOffsetMs = realTimeMs - Date.now();
                }
            } catch(e2) {
                timeOffsetMs = 0;
            }
        }
    }

    // Initialize API request
    initGeolocation();
    syncNetworkTime();

    // Initial render
    updateClock();

    setInterval(updateClock, 100);
});
