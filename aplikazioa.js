// ========================================
// DATUAK
// ========================================
let platerak = [];
let osagaienKatalogoa = [];
let astePlangintza = {};
let unekoAsteHasiera = null;
let erosketaZerrenda = [];
let dataGarrantzitsuak = [];
let etxekoOharrak = [];

const DATUEN_GAKOA = "gure_etxea_datuak_v1";

// ========================================
// SUPABASE AUTENTIFIKAZIOA
// ========================================
const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);
let erabiltzailea = null;
// Autentifikazioa behin-behinean desgaituta: aplikazioa zuzenean irekitzen da.
const AUTENTIFIKAZIOA_AKTIBATUTA = false;

// ========================================
// SUPABASE DATUEN SINKRONIZAZIOA
// ========================================
const SUPABASE_DATUEN_ID = "etxea";
let supabaseSinkronizazioTimer = null;
let supabaseSinkronizatzen = false;
let supabaseSinkronizazioPrest = false;

function lortuCloudDatuak() {
    return {
        platerak: platerak.map(p => ({ ...p, irudia: null, pdf: null })),
        osagaienKatalogoa,
        astePlangintza,
        erosketaZerrenda,
        dataGarrantzitsuak,
        etxekoOharrak,
        spotifyZerrendak
    };
}

function gordeCloudDatuakLokalean(datuak) {
    platerak = Array.isArray(datuak?.platerak) ? datuak.platerak : [];
    platerak.forEach(p => { if (typeof p.denbora !== "string") p.denbora = ""; });
    osagaienKatalogoa = Array.isArray(datuak?.osagaienKatalogoa) ? datuak.osagaienKatalogoa : [];
    astePlangintza = datuak?.astePlangintza || {};
    erosketaZerrenda = Array.isArray(datuak?.erosketaZerrenda) ? datuak.erosketaZerrenda : [];
    dataGarrantzitsuak = Array.isArray(datuak?.dataGarrantzitsuak) ? datuak.dataGarrantzitsuak : [];
    etxekoOharrak = Array.isArray(datuak?.etxekoOharrak) ? datuak.etxekoOharrak : [];
    spotifyZerrendak = Array.isArray(datuak?.spotifyZerrendak) ? datuak.spotifyZerrendak : [];
    localStorage.setItem(SPOTIFY_GAKOA, JSON.stringify(spotifyZerrendak));
}

async function sinkronizatuSupabaseDatuak() {
    if (!erabiltzailea || supabaseSinkronizatzen) return;
    supabaseSinkronizatzen = true;
    try {
        const { data, error } = await supabaseClient
            .from("etxeko_datuak")
            .select("id,datuak")
            .eq("id", SUPABASE_DATUEN_ID)
            .maybeSingle();

        if (error) throw error;

        const lokalak = lortuCloudDatuak();
        const cloudak = data?.datuak;
        const cloudakBaAlDitu = cloudak && Object.keys(cloudak).some(gakoa => {
            const balioa = cloudak[gakoa];
            return Array.isArray(balioa) ? balioa.length > 0 : balioa && Object.keys(balioa).length > 0;
        });

        if (cloudakBaAlDitu) {
            gordeCloudDatuakLokalean(cloudak);
            localStorage.setItem(DATUEN_GAKOA, JSON.stringify(lortuCloudDatuak()));
        } else {
            const { error: upsertErrorea } = await supabaseClient
                .from("etxeko_datuak")
                .upsert({ id: SUPABASE_DATUEN_ID, datuak: lokalak, eguneratua_at: new Date().toISOString() }, { onConflict: "id" });
            if (upsertErrorea) throw upsertErrorea;
        }
        supabaseSinkronizazioPrest = true;
    } catch (errorea) {
        console.warn("Supabase sinkronizazioan errorea:", errorea);
    } finally {
        supabaseSinkronizatzen = false;
    }
}



// Gailu desberdinen arteko eguneratzea: orria berriro aktibatzean eta 30 segundoro.
let supabaseEguneratzeTimer = null;

async function eguneratuSupabaseDatuak() {
    if (!erabiltzailea || supabaseSinkronizatzen) return;
    supabaseSinkronizazioPrest = false;
    await sinkronizatuSupabaseDatuak();
}

function hasiSupabaseEguneratzeAutomatikoa() {
    clearInterval(supabaseEguneratzeTimer);
    supabaseEguneratzeTimer = setInterval(() => {
        eguneratuSupabaseDatuak();
    }, 30000);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") eguneratuSupabaseDatuak();
    });
}
function programatuSupabaseSinkronizazioa() {
    if (!erabiltzailea || !supabaseSinkronizazioPrest) return;
    clearTimeout(supabaseSinkronizazioTimer);
    supabaseSinkronizazioTimer = setTimeout(async () => {
        try {
            const { error } = await supabaseClient
                .from("etxeko_datuak")
                .upsert({ id: SUPABASE_DATUEN_ID, datuak: lortuCloudDatuak(), eguneratua_at: new Date().toISOString() }, { onConflict: "id" });
            if (error) throw error;
        } catch (errorea) {
            console.warn("Ezin izan dira datuak Supabase-ra bidali:", errorea);
        }
    }, 700);
}

function erakutsiSaioPantaila(mezua = "") {
    const edukia = document.getElementById("edukia");
    const menua = document.querySelector(".menua");
    if (menua) menua.style.display = "none";
    if (!edukia) return;

    edukia.innerHTML = `
        <div class="saioPantaila">
            <div class="saioTxartela">
                <div class="saioIkonoa">🏠</div>
                <h2>Gure etxea</h2>
                <p class="saioAzalpena">Sartu zure Google kontuarekin.</p>

                <button type="button" class="saioBotoiNagusia" onclick="googlezSaioaHasi()">
                    🔵 Google-rekin sartu
                </button>

                <div id="saioMezua" class="saioMezua">${ihesTestua(mezua)}</div>
            </div>
        </div>
    `;
}

async function googlezSaioaHasi() {
    const mezua = document.getElementById("saioMezua");
    if (mezua) mezua.textContent = "⏳ Google irekitzen...";

    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: window.location.origin + window.location.pathname
        }
    });

    if (error && mezua) {
        mezua.textContent = "❌ Ezin izan da Google bidez saioa hasi: " + error.message;
    }
}

function erakutsiAplikazioa() {
    const menua = document.querySelector(".menua");
    if (menua) menua.style.display = "grid";
    const edukia = document.getElementById("edukia");
    if (edukia) {
        edukia.innerHTML = `
            <div class="saioaGoiburua">
                <div>
                    <h2>Ongi etorri! 👋</h2>
                    <p>${ihesTestua(erabiltzailea?.email || "")}</p>
                </div>
                <button onclick="saioaItxi()">🔒 Itxi saioa</button>
            </div>
            <p>Aukeratu atal bat hasteko.</p>
        `;
    }
}

async function saioaHasi(event) {
    event.preventDefault();
    const email = document.getElementById("saioEmaila")?.value.trim() || "";
    const pasahitza = document.getElementById("saioPasahitza")?.value || "";
    const mezua = document.getElementById("saioMezua");

    if (mezua) mezua.textContent = "⏳ Saioa hasten...";
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pasahitza });

    if (error) {
        if (mezua) mezua.textContent = "❌ Emaila edo pasahitza ez da zuzena.";
        return;
    }

    erabiltzailea = data.user;
    erakutsiAplikazioa();
    await sinkronizatuSupabaseDatuak();
}

async function kontuaSortu() {
    const email = document.getElementById("saioEmaila")?.value.trim() || "";
    const pasahitza = document.getElementById("saioPasahitza")?.value || "";
    const mezua = document.getElementById("saioMezua");

    if (!email || !pasahitza) {
        if (mezua) mezua.textContent = "✏️ Idatzi emaila eta pasahitza lehenengo.";
        return;
    }
    if (pasahitza.length < 6) {
        if (mezua) mezua.textContent = "🔐 Pasahitzak gutxienez 6 karaktere izan behar ditu.";
        return;
    }

    if (mezua) mezua.textContent = "⏳ Kontua sortzen...";
    const { data, error } = await supabaseClient.auth.signUp({ email, password: pasahitza });

    if (error) {
        if (mezua) mezua.textContent = "❌ Ezin izan da kontua sortu: " + error.message;
        return;
    }

    if (data.session) {
        erabiltzailea = data.user;
        erakutsiAplikazioa();
        await sinkronizatuSupabaseDatuak();
    } else {
        if (mezua) mezua.textContent = "📧 Kontua sortuta. Begiratu emaila eta baieztatu kontua; ondoren hasi saioa.";
    }
}

async function pasahitzaBerreskuratu() {
    const email = document.getElementById("saioEmaila")?.value.trim() || "";
    const mezua = document.getElementById("saioMezua");
    if (!email) {
        if (mezua) mezua.textContent = "✏️ Idatzi emaila lehenengo.";
        return;
    }

    if (mezua) mezua.textContent = "⏳ Berreskuratze-emaila bidaltzen...";
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
    });

    if (error) {
        if (mezua) mezua.textContent = "❌ Ezin izan da emaila bidali.";
        return;
    }
    if (mezua) mezua.textContent = "📧 Begiratu zure emaila pasahitza berrezartzeko.";
}

async function saioaItxi() {
    await supabaseClient.auth.signOut();
    erabiltzailea = null;
    erakutsiSaioPantaila();
}

async function egiaztatuSaioa() {
    if (!AUTENTIFIKAZIOA_AKTIBATUTA) {
        erakutsiAplikazioa();
        return;
    }

    const { data, error } = await supabaseClient.auth.getUser();
    if (error || !data.user) {
        erabiltzailea = null;
        erakutsiSaioPantaila();
        return;
    }
    erabiltzailea = data.user;
    erakutsiAplikazioa();
    await sinkronizatuSupabaseDatuak();
    hasiSupabaseEguneratzeAutomatikoa();
}

if (AUTENTIFIKAZIOA_AKTIBATUTA) {
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        erabiltzailea = session?.user || null;
        if (erabiltzailea) {
            erakutsiAplikazioa();
            hasiSupabaseEguneratzeAutomatikoa();
        } else {
            erakutsiSaioPantaila();
            clearInterval(supabaseEguneratzeTimer);
        }
    });
}



function gordeDatuak() {
    try {
        localStorage.setItem(DATUEN_GAKOA, JSON.stringify(lortuCloudDatuak()));
        programatuSupabaseSinkronizazioa();
    } catch (errorea) {
        console.warn("Ezin izan dira datuak gorde:", errorea);
    }
}

function kargatuDatuak() {
    try {
        const gordeta = localStorage.getItem(DATUEN_GAKOA);
        if (!gordeta) return;
        const datuak = JSON.parse(gordeta);
        platerak = Array.isArray(datuak.platerak) ? datuak.platerak : [];
        platerak.forEach(p => { if (typeof p.denbora !== "string") p.denbora = ""; });
        osagaienKatalogoa = Array.isArray(datuak.osagaienKatalogoa) ? datuak.osagaienKatalogoa : [];
        astePlangintza = datuak.astePlangintza || {};
        erosketaZerrenda = Array.isArray(datuak.erosketaZerrenda) ? datuak.erosketaZerrenda : [];
        dataGarrantzitsuak = Array.isArray(datuak.dataGarrantzitsuak) ? datuak.dataGarrantzitsuak : [];
        etxekoOharrak = Array.isArray(datuak.etxekoOharrak) ? datuak.etxekoOharrak : [];
    } catch (errorea) {
        console.warn("Ezin izan dira datuak kargatu:", errorea);
    }
}

kargatuDatuak();
window.addEventListener("DOMContentLoaded", egiaztatuSaioa);

const plangintzaAukerak = [
    "Tupperra",
    "Soberakinak",
    "Kanpoan jan",
    "Etxean jan - beste bat",
    "Ezer ez"
];

// ========================================
// ATALAK
// ========================================
function erakutsiAtala(atala) {
    const edukia = document.getElementById("edukia");
    if (atala === "platerak") erakutsiPlaterak();
    else if (atala === "plangintza") erakutsiPlangintza();
    else if (atala === "erosketa") erakutsiErosketaZerrenda();
    else if (atala === "musika") edukia.innerHTML = `<h2>🎵 Erreprodukzio-zerrendak</h2><p>Aurrerago egingo dugu atal hau.</p>`;
    else if (atala === "datak") erakutsiDataGarrantzitsuak();
    else if (atala === "oharrak") erakutsiEtxekoOharrak();
}

// ========================================
// GOOGLE CALENDAR
// ========================================
let googleTokenClient = null;
let googleGapiPrest = false;
let googleGisPrest = false;
let calendarHilabetea = new Date();
let calendarEkitaldiak = [];
let calendarKoloreak = {};

function erakutsiDataGarrantzitsuak() {
    const edukia = document.getElementById("edukia");
    edukia.innerHTML = `
        <div class="calendarGoiburuaAtala">
            <div>
                <h2>❤️ Google Calendar</h2>
                <p>Gure etxeko egutegiko ekitaldiak hemen ikus ditzakezu.</p>
            </div>
            <span class="calendarIrakurtzekoSoilik">👁️ Irakurtzeko soilik</span>
        </div>

        <div class="calendarTresnak">
            <button onclick="googleCalendarSaioaHasi()">🔐 Konektatu</button>
            <button onclick="googleCalendarEguneratu()">🔄 Eguneratu</button>
            <button onclick="calendarAurrekoa()">⬅️</button>
            <strong id="calendarHilabeteIzenburua"></strong>
            <button onclick="calendarHurrengoa()">➡️</button>
            <button onclick="calendarGaur()">📍 Gaur</button>
            <button onclick="googleCalendarDeskonektatu()">🔒 Deskonektatu</button>
        </div>

        <div id="googleCalendarMezua" class="calendarMezua"></div>
        <div id="googleCalendarLaburpena" class="calendarLaburpena"></div>
        <div id="googleCalendarXehetasunak" class="calendarXehetasunak"></div>
        <div id="googleCalendarTaula"></div>
        <div id="googleCalendarAgenda" class="calendarAgenda"></div>
    `;
    prestatuGoogleCalendar();
    marraztuGoogleCalendar();
}

function prestatuGoogleCalendar() {
    if (typeof gapi === "undefined" || typeof google === "undefined") {
        setTimeout(prestatuGoogleCalendar, 300);
        return;
    }
    if (!googleGapiPrest) {
        gapi.load("client", async () => {
            try {
                await gapi.client.init({
                    apiKey: GOOGLE_API_KEY,
                    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"]
                });
                const koloreErantzuna = await gapi.client.calendar.colors.get({});
                calendarKoloreak = koloreErantzuna.result?.event || {};
                googleGapiPrest = true;
                prestatuGoogleTokena();
            } catch (errorea) {
                erakutsiGoogleCalendarMezua("Ezin izan da Google Calendar prestatu. Egiaztatu API Key-a.");
            }
        });
    } else {
        prestatuGoogleTokena();
    }
}

function prestatuGoogleTokena() {
    if (googleGisPrest) return;
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes("SARTU_")) {
        erakutsiGoogleCalendarMezua("⚙️ Falta dira Google Cloud-eko Client ID eta API Key-a google-konfigurazioa.js fitxategian.");
        marraztuCalendarHutsa();
        return;
    }
    googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: "https://www.googleapis.com/auth/calendar.readonly",
        callback: ""
    });
    googleGisPrest = true;
}

function googleCalendarSaioaHasi() {
    if (!googleTokenClient) {
        prestatuGoogleCalendar();
        setTimeout(googleCalendarSaioaHasi, 500);
        return;
    }
    googleTokenClient.callback = async (erantzuna) => {
        if (erantzuna.error) {
            erakutsiGoogleCalendarMezua("❌ Ezin izan da Google Calendar konektatu.");
            return;
        }
        erakutsiGoogleCalendarMezua("⏳ Google Calendar konektatzen...");
        await googleCalendarEguneratu();
    };
    googleTokenClient.requestAccessToken({ prompt: "consent" });
}

function googleCalendarDeskonektatu() {
    if (typeof google !== "undefined" && gapi.client.getToken()) {
        const tokena = gapi.client.getToken();
        if (tokena && tokena.access_token) {
            google.accounts.oauth2.revoke(tokena.access_token, () => {});
        }
        gapi.client.setToken(null);
    }
    calendarEkitaldiak = [];
    erakutsiGoogleCalendarMezua("🔒 Google Calendar deskonektatuta.");
    marraztuGoogleCalendar();
}

async function googleCalendarEguneratu() {
    if (!googleGapiPrest) {
        erakutsiGoogleCalendarMezua("⏳ Google Calendar prestatzen...");
        prestatuGoogleCalendar();
        return;
    }
    const tokena = gapi.client.getToken();
    if (!tokena || !tokena.access_token) {
        erakutsiGoogleCalendarMezua("🔐 Lehenengo sakatu 'Konektatu'.");
        return;
    }

    erakutsiGoogleCalendarMezua("⏳ Ekitaldiak kargatzen...");
    const lehenEguna = new Date(calendarHilabetea.getFullYear(), calendarHilabetea.getMonth(), 1, 0, 0, 0);
    const azkenEguna = new Date(calendarHilabetea.getFullYear(), calendarHilabetea.getMonth() + 1, 1, 0, 0, 0);

    try {
        const erantzuna = await gapi.client.calendar.events.list({
            calendarId: "primary",
            timeMin: lehenEguna.toISOString(),
            timeMax: azkenEguna.toISOString(),
            showDeleted: false,
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 2500
        });
        calendarEkitaldiak = erantzuna.result.items || [];
        erakutsiGoogleCalendarMezua(`✅ ${calendarEkitaldiak.length} ekitaldi kargatu dira.`);
        marraztuGoogleCalendar();
    } catch (errorea) {
        console.error(errorea);
        erakutsiGoogleCalendarMezua("❌ Ezin izan dira Calendar-eko ekitaldiak kargatu. Egiaztatu baimenak eta konfigurazioa.");
    }
}

function erakutsiGoogleCalendarMezua(mezua) {
    const elementua = document.getElementById("googleCalendarMezua");
    if (elementua) elementua.innerHTML = mezua;
}

function calendarAurrekoa() {
    calendarHilabetea = new Date(calendarHilabetea.getFullYear(), calendarHilabetea.getMonth() - 1, 1);
    marraztuGoogleCalendar();
    if (gapi.client.getToken()) googleCalendarEguneratu();
}

function calendarHurrengoa() {
    calendarHilabetea = new Date(calendarHilabetea.getFullYear(), calendarHilabetea.getMonth() + 1, 1);
    marraztuGoogleCalendar();
    if (gapi.client.getToken()) googleCalendarEguneratu();
}

function calendarGaur() {
    calendarHilabetea = new Date();
    marraztuGoogleCalendar();
    if (gapi.client.getToken()) googleCalendarEguneratu();
}

function marraztuCalendarHutsa() {
    calendarEkitaldiak = [];
    marraztuGoogleCalendar();
}

function marraztuGoogleCalendar() {
    const taula = document.getElementById("googleCalendarTaula");
    const izenburua = document.getElementById("calendarHilabeteIzenburua");
    if (!taula || !izenburua) return;

    const hilabeteIzenak = ["Urtarrila","Otsaila","Martxoa","Apirila","Maiatza","Ekaina","Uztaila","Abuztua","Iraila","Urria","Azaroa","Abendua"];
    izenburua.textContent = `${hilabeteIzenak[calendarHilabetea.getMonth()]} ${calendarHilabetea.getFullYear()}`;

    const egunIzenak = ["Astelehena","Asteartea","Asteazkena","Osteguna","Ostirala","Larunbata","Igandea"];
    let html = `<div class="calendarGrid">`;
    egunIzenak.forEach(e => html += `<div class="calendarGoiburua">${e}</div>`);

    const lehenEguna = new Date(calendarHilabetea.getFullYear(), calendarHilabetea.getMonth(), 1);
    let hasierakoPos = lehenEguna.getDay();
    hasierakoPos = hasierakoPos === 0 ? 6 : hasierakoPos - 1;
    const egunKopurua = new Date(calendarHilabetea.getFullYear(), calendarHilabetea.getMonth() + 1, 0).getDate();
    const aurrekoHilabetekoEgunak = new Date(calendarHilabetea.getFullYear(), calendarHilabetea.getMonth(), 0).getDate();
    const gelaxkaKopurua = Math.ceil((hasierakoPos + egunKopurua) / 7) * 7;
    const dataGakoaLokala = data => `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,"0")}-${String(data.getDate()).padStart(2,"0")}`;
    const gaurGakoa = dataGakoaLokala(new Date());

    for (let pos = 0; pos < gelaxkaKopurua; pos++) {
        const egunZenbakia = pos - hasierakoPos + 1;
        let dataObj;
        let besteHilabete = false;
        if (egunZenbakia < 1) {
            dataObj = new Date(calendarHilabetea.getFullYear(), calendarHilabetea.getMonth() - 1, aurrekoHilabetekoEgunak + egunZenbakia);
            besteHilabete = true;
        } else if (egunZenbakia > egunKopurua) {
            dataObj = new Date(calendarHilabetea.getFullYear(), calendarHilabetea.getMonth() + 1, egunZenbakia - egunKopurua);
            besteHilabete = true;
        } else {
            dataObj = new Date(calendarHilabetea.getFullYear(), calendarHilabetea.getMonth(), egunZenbakia);
        }

        const gakoa = dataGakoaLokala(dataObj);
        const klaseak = ["calendarEguna"];
        if (besteHilabete) klaseak.push("besteHilabete");
        if (gakoa === gaurGakoa) klaseak.push("gaur");

        const egunekoak = calendarEkitaldiak.filter(e => calendarEkitaldiarenData(e) === gakoa);
        html += `<div class="${klaseak.join(" ")}"><div class="calendarEgunZenbakia">${dataObj.getDate()}</div>`;
        egunekoak.forEach(e => {
            const ordua = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString("eu-ES",{hour:"2-digit",minute:"2-digit"}) : "Egun osoa";
            const kolorea = calendarEkitaldiKolorea(e);
            html += `<button class="calendarEkitaldia" style="${kolorea}" title="${ihesHtml(e.summary || "Ekitaldia")}" onclick="erakutsiCalendarEkitaldiXehetasunak('${ihesHtmlAttribute(e.id || "")}')"><strong>${ihesHtml(e.summary || "(Izenik gabe)")}</strong><br><small>${ordua}</small></button>`;
        });
        html += `</div>`;
    }
    html += "</div>";
    taula.innerHTML = html;

    const laburpena = document.getElementById("googleCalendarLaburpena");
    if (laburpena) {
        const hilabetekoak = calendarEkitaldiak.filter(e => {
            const d = calendarEkitaldiarenData(e);
            return d.startsWith(`${calendarHilabetea.getFullYear()}-${String(calendarHilabetea.getMonth()+1).padStart(2,"0")}`);
        });
        laburpena.innerHTML = hilabetekoak.length ? `📌 Hilabete honetan <strong>${hilabetekoak.length}</strong> ekitaldi${hilabetekoak.length === 1 ? "a" : ""}.` : "📭 Hilabete honetan ez dago ekitaldirik.";
    }

    marraztuCalendarAgenda();
}

function marraztuCalendarAgenda() {
    const agenda = document.getElementById("googleCalendarAgenda");
    if (!agenda) return;
    const hilabetekoak = [...calendarEkitaldiak].sort((a,b) => calendarEkitaldiarenData(a).localeCompare(calendarEkitaldiarenData(b)));
    if (!hilabetekoak.length) {
        agenda.innerHTML = "";
        return;
    }
    agenda.innerHTML = `
        <h3>📋 Hilabeteko agenda</h3>
        ${hilabetekoak.map(e => {
            const data = calendarEkitaldiarenData(e);
            const izena = ihesHtml(e.summary || "(Izenik gabe)");
            const dataPolita = data ? new Date(data + "T12:00:00").toLocaleDateString("eu-ES",{weekday:"short",day:"numeric",month:"long"}) : "";
            const ordua = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString("eu-ES",{hour:"2-digit",minute:"2-digit"}) : "Egun osoa";
            return `<button class="calendarAgendaEkitaldia" style="${calendarEkitaldiKolorea(e)}" onclick="erakutsiCalendarEkitaldiXehetasunak('${ihesHtmlAttribute(e.id || "")}')"><div><strong>${izena}</strong><small>${dataPolita} · ${ordua}</small></div></button>`;
        }).join("")}
    `;
}

function calendarEkitaldiKolorea(ekitaldia) {
    const kolorea = ekitaldia?.colorId ? calendarKoloreak[ekitaldia.colorId] : null;
    if (kolorea?.background && kolorea?.foreground) {
        return `background:${kolorea.background};color:${kolorea.foreground};`;
    }
    return "";
}

function ihesHtmlAttribute(testua) {
    return String(testua).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function erakutsiCalendarEkitaldiXehetasunak(id) {
    const ekitaldia = calendarEkitaldiak.find(e => e.id === id);
    if (!ekitaldia) return;

    const izena = ihesHtml(ekitaldia.summary || "(Izenik gabe)");
    const kokapena = ekitaldia.location ? ihesHtml(ekitaldia.location) : "Ez da zehaztu";
    const deskribapena = ekitaldia.description ? ihesHtml(ekitaldia.description).replace(/\n/g, "<br>") : "Deskribapenik ez";
    const hasieraData = calendarDataOrdua(ekitaldia.start);
    const amaieraData = calendarDataOrdua(ekitaldia.end);
    const esteka = ekitaldia.htmlLink ? `<a href="${ihesHtmlAttribute(ekitaldia.htmlLink)}" target="_blank" rel="noopener">Google Calendar-en ireki ↗</a>` : "";

    const xehetasunak = document.getElementById("googleCalendarXehetasunak");
    if (!xehetasunak) return;

    xehetasunak.innerHTML = `
        <div class="calendarXehetasunTxartela">
            <div class="calendarXehetasunGoiburua">
                <h3>📌 ${izena}</h3>
                <button onclick="itxiCalendarXehetasunak()" aria-label="Itxi">✕</button>
            </div>
            <div class="calendarXehetasunEremua"><strong>🕐 Noiz:</strong><span>${hasieraData}${amaieraData ? " — " + amaieraData : ""}</span></div>
            <div class="calendarXehetasunEremua"><strong>📍 Non:</strong><span>${kokapena}</span></div>
            <div class="calendarXehetasunEremua"><strong>📝 Deskribapena:</strong><span>${deskribapena}</span></div>
            ${esteka ? `<div class="calendarXehetasunEsteka">${esteka}</div>` : ""}
        </div>
    `;
    xehetasunak.scrollIntoView({behavior:"smooth", block:"nearest"});
}

function calendarDataOrdua(datuak) {
    if (!datuak) return "";
    if (datuak.date) {
        return new Date(datuak.date + "T12:00:00").toLocaleDateString("eu-ES", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
    }
    if (datuak.dateTime) {
        return new Date(datuak.dateTime).toLocaleString("eu-ES", {weekday:"long", day:"numeric", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit"});
    }
    return "";
}

function itxiCalendarXehetasunak() {
    const xehetasunak = document.getElementById("googleCalendarXehetasunak");
    if (xehetasunak) xehetasunak.innerHTML = "";
}

function calendarEkitaldiarenData(ekitaldia) {
    if (ekitaldia.start?.dateTime) return ekitaldia.start.dateTime.slice(0, 10);
    return ekitaldia.start?.date || "";
}

// ========================================
// PLATERAK
// ========================================
function erakutsiPlaterak() {
    const edukia = document.getElementById("edukia");
    const kategoriak = [...new Set(platerak.map(p => p.kategoria).filter(Boolean))];
    const etiketak = [...new Set(platerak.flatMap(p => p.etiketak || []))];

    edukia.innerHTML = `<h2>🍽️ Platerak</h2>
        <button onclick="erakutsiPlaterBerria()">➕ Plater berria</button>
        <button onclick="erakutsiOsagaienKatalogoa()">🥕 Osagaien katalogoa</button>
        <div class="platerIragazkiak">
            <input type="search" id="platerBilaketa" placeholder="🔎 Bilatu platera..." oninput="iragaziPlaterak()">
            <select id="platerKategoriaIragazkia" onchange="iragaziPlaterak()">
                <option value="">📂 Kategoria guztiak</option>
                ${kategoriak.map(k => `<option value="${k}">${k}</option>`).join("")}
            </select>
            <select id="platerEtiketaIragazkia" onchange="iragaziPlaterak()">
                <option value="">🏷️ Etiketa guztiak</option>
                ${etiketak.map(e => `<option value="${e}">${e}</option>`).join("")}
            </select>
            <select id="platerDenboraIragazkia" onchange="iragaziPlaterak()">
                <option value="">⏱️ Denbora guztiak</option>
                <option value="15">15 min edo gutxiago</option>
                <option value="30">30 min edo gutxiago</option>
                <option value="60">1 ordu edo gutxiago</option>
                <option value="120">2 ordu edo gutxiago</option>
            </select>
            <label class="gogokoIragazkia"><input type="checkbox" id="gogokoakBakarrik" onchange="iragaziPlaterak()"> ❤️ Gogokoak bakarrik</label>
        </div>
        <div id="platerenZerrenda">${sortuPlaterenZerrenda()}</div>`;
}

function iragaziPlaterak() {
    const bilaketa = (document.getElementById("platerBilaketa")?.value || "").trim().toLowerCase();
    const kategoria = document.getElementById("platerKategoriaIragazkia")?.value || "";
    const etiketa = document.getElementById("platerEtiketaIragazkia")?.value || "";
    const denboraMax = Number(document.getElementById("platerDenboraIragazkia")?.value || 0);
    const gogokoak = document.getElementById("gogokoakBakarrik")?.checked || false;
    const emaitzak = platerak.map((p, i) => ({p, i})).filter(({p}) => {
        const izenEgokia = !bilaketa || p.izena.toLowerCase().includes(bilaketa);
        const kategoriaEgokia = !kategoria || p.kategoria === kategoria;
        const etiketaEgokia = !etiketa || (p.etiketak || []).includes(etiketa);
        const gogokoEgokia = !gogokoak || (p.etiketak || []).includes("Gogokoa");
        const minutuak = lortuDenboraMinutuetan(p.denbora);
        const denboraEgokia = !denboraMax || (minutuak !== null && minutuak <= denboraMax);
        return izenEgokia && kategoriaEgokia && etiketaEgokia && gogokoEgokia && denboraEgokia;
    });
    document.getElementById("platerenZerrenda").innerHTML = sortuPlaterenZerrenda(emaitzak);
}

function lortuDenboraMinutuetan(denbora) {
    if (!denbora) return null;
    const testua = String(denbora).toLowerCase().trim();
    const orduak = testua.match(/(\d+(?:[.,]\d+)?)\s*(ordu|h|hours?)/);
    const minutuak = testua.match(/(\d+(?:[.,]\d+)?)\s*(minutu|min|m|minutes?)/);
    let guztira = 0;
    if (orduak) guztira += parseFloat(orduak[1].replace(',', '.')) * 60;
    if (minutuak) guztira += parseFloat(minutuak[1].replace(',', '.'));
    if (guztira > 0) return guztira;
    const zenbakia = testua.match(/\d+(?:[.,]\d+)?/);
    return zenbakia ? parseFloat(zenbakia[0].replace(',', '.')) : null;
}

function erakutsiPlaterBerria() {
    const edukia = document.getElementById("edukia");
    edukia.innerHTML = `<h2>🍽️ Plater berria</h2>
        <label>Plateraren izena:</label><br>
        <input type="text" id="platerIzena" placeholder="Adib. Makarroiak"><br><br>
        <label>🖼️ Plateraren irudia:</label><br><br>
        <input type="file" id="platerIrudia" accept="image/*"><br><br>
        <label>📄 PDFko errezeta:</label><br><br>
        <input type="file" id="platerPdf" accept="application/pdf"><br><br>
        <label>Kategoria:</label><br>
        <select id="platerKategoria"><option value="Lehenengoa">Lehenengoa</option><option value="Bigarrena">Bigarrena</option><option value="Postrea">Postrea</option></select><br><br>        <label>⏱️ Denbora (aukerakoa):</label><br>
        <input type="text" id="platerDenbora" placeholder="Adib. 30 minutu"><br><br>

        <h3>🏷️ Etiketak</h3>
        ${etiketaCheckbox("Begetarianoa", "etiketa")}
        ${etiketaCheckbox("Beganoa", "etiketa")}
        ${etiketaCheckbox("Glutenik gabea", "etiketa")}
        ${etiketaCheckbox("Laktosarik gabea", "etiketa")}
        ${etiketaCheckbox("Gogokoa", "etiketa", "❤️ ")}<br>
        <h3>🥕 Osagaiak</h3>
        <div id="osagaienZerrenda">${sortuOsagaiBerria()}</div>
        <br><button onclick="gehituOsagaia()">➕ Beste osagai bat</button><br><br>
        <button onclick="gordePlatera()">💾 Gorde platera</button>
        <button onclick="erakutsiPlaterak()">↩️ Itzuli</button>`;
}

function etiketaCheckbox(izena, klasea, aurrekoa = "") {
    return `<label><input type="checkbox" value="${izena}" class="${klasea}">${aurrekoa}${izena}</label><br>`;
}

function sortuOsagaiBerria() {
    let aukerak = `<option value="">Aukeratu osagaia</option>`;
    osagaienKatalogoa.forEach((osagaia, indizea) => aukerak += `<option value="${indizea}">${osagaia.izena}</option>`);
    return `<div class="osagaia"><select class="osagaiKatalogokoAukera" onchange="aldatuOsagaiMota(this)">${aukerak}<option value="BERRIA">➕ Osagai berria...</option></select>
        <input type="text" class="osagaiBerriarenIzena" placeholder="Osagai berriaren izena" style="display:none">
        <input type="number" class="osagaiKantitatea" placeholder="Kantitatea" min="0" step="any">${sortuUnitateEremua()}</div>`;
}

function sortuUnitateEremua(aukeratutakoUnitatea = "") {
    const arruntak = ["", "g", "kg", "ml", "l", "unitate", "koilarakada"];
    const berezia = aukeratutakoUnitatea !== "" && !arruntak.includes(aukeratutakoUnitatea);
    return `<select class="osagaiUnitatea" onchange="aldatuUnitatea(this)">
        <option value="" ${aukeratutakoUnitatea === "" ? "selected" : ""}>Unitaterik gabe</option>
        <option value="g" ${aukeratutakoUnitatea === "g" ? "selected" : ""}>g</option>
        <option value="kg" ${aukeratutakoUnitatea === "kg" ? "selected" : ""}>kg</option>
        <option value="ml" ${aukeratutakoUnitatea === "ml" ? "selected" : ""}>ml</option>
        <option value="l" ${aukeratutakoUnitatea === "l" ? "selected" : ""}>l</option>
        <option value="unitate" ${aukeratutakoUnitatea === "unitate" ? "selected" : ""}>unitate</option>
        <option value="koilarakada" ${aukeratutakoUnitatea === "koilarakada" ? "selected" : ""}>koilarakada</option>
        <option value="BEREZIA" ${berezia ? "selected" : ""}>✏️ Beste unitate bat...</option>
    </select><input type="text" class="osagaiUnitateBerezia" placeholder="Adib. cm, koilaratxo..." value="${berezia ? aukeratutakoUnitatea : ""}" style="display:${berezia ? "inline-block" : "none"}">`;
}

function aldatuUnitatea(selecta) {
    const input = selecta.parentElement.querySelector(".osagaiUnitateBerezia");
    if (selecta.value === "BEREZIA") { input.style.display = "inline-block"; input.focus(); }
    else { input.style.display = "none"; input.value = ""; }
}

function aldatuOsagaiMota(selecta) {
    const input = selecta.parentElement.querySelector(".osagaiBerriarenIzena");
    if (selecta.value === "BERRIA") { input.style.display = "inline-block"; input.focus(); }
    else { input.style.display = "none"; input.value = ""; }
}

function gehituOsagaia() {
    const zerrenda = document.getElementById("osagaienZerrenda");
    const osagaia = document.createElement("div"); osagaia.className = "osagaia";
    let aukerak = `<option value="">Aukeratu osagaia</option>`;
    osagaienKatalogoa.forEach((o, i) => aukerak += `<option value="${i}">${o.izena}</option>`);
    osagaia.innerHTML = `<br><select class="osagaiKatalogokoAukera" onchange="aldatuOsagaiMota(this)">${aukerak}<option value="BERRIA">➕ Osagai berria...</option></select>
        <input type="text" class="osagaiBerriarenIzena" placeholder="Osagai berriaren izena" style="display:none">
        <input type="number" class="osagaiKantitatea" placeholder="Kantitatea" min="0" step="any">${sortuUnitateEremua()}
        <button type="button" onclick="this.parentElement.remove()">❌</button>`;
    zerrenda.appendChild(osagaia);
}

function lortuEdoSortuOsagaia(izena) {
    const garbitua = izena.trim(); if (!garbitua) return null;
    const aurkitua = osagaienKatalogoa.find(o => o.izena.toLowerCase() === garbitua.toLowerCase());
    if (aurkitua) return aurkitua;
    const berria = { id: Date.now() + Math.random(), izena: garbitua };
    osagaienKatalogoa.push(berria); return berria;
}

function lortuOsagaiUnitatea(osagaia) {
    const selecta = osagaia.querySelector(".osagaiUnitatea"); if (!selecta) return "";
    if (selecta.value === "BEREZIA") return osagaia.querySelector(".osagaiUnitateBerezia")?.value.trim() || "";
    return selecta.value;
}

function irakurriOsagaiak(zerrendaSelector) {
    const emaitza = [];
    document.querySelectorAll(`${zerrendaSelector} .osagaia`).forEach(osagaia => {
        const aukeraketa = osagaia.querySelector(".osagaiKatalogokoAukera");
        const kantitatea = osagaia.querySelector(".osagaiKantitatea")?.value || "";
        const unitatea = lortuOsagaiUnitatea(osagaia);
        let katalogokoOsagaia = null;
        if (aukeraketa && aukeraketa.value && aukeraketa.value !== "BERRIA") katalogokoOsagaia = osagaienKatalogoa[Number(aukeraketa.value)];
        else if (aukeraketa?.value === "BERRIA") katalogokoOsagaia = lortuEdoSortuOsagaia(osagaia.querySelector(".osagaiBerriarenIzena")?.value || "");
        if (katalogokoOsagaia) emaitza.push({ osagaiaId:katalogokoOsagaia.id, izena:katalogokoOsagaia.izena, kantitatea:kantitatea === "" ? null : Number(kantitatea), unitatea });
    });
    return emaitza;
}

function gordePlatera() {
    const izena = document.getElementById("platerIzena").value;
    const pdf = document.getElementById("platerPdf").files[0];
    if (!izena.trim()) return alert("Mesedez, idatzi plateraren izena.");
    if (pdf && pdf.type !== "application/pdf") return alert("Mesedez, aukeratu PDF fitxategi bat.");
    const etiketak = [...document.querySelectorAll(".etiketa:checked")].map(e => e.value);
    const irudia = document.getElementById("platerIrudia").files[0];
    platerak.push({ id:Date.now(), izena:izena.trim(), kategoria:document.getElementById("platerKategoria").value, denbora:document.getElementById("platerDenbora")?.value.trim() || "", etiketak, osagaiak:irakurriOsagaiak("#osagaienZerrenda"), irudia:irudia ? URL.createObjectURL(irudia) : null, pdf:pdf ? URL.createObjectURL(pdf) : null });
    gordeDatuak();
    alert("Platera gordeta! 🍽️"); erakutsiPlaterak();
}

function sortuPlaterenZerrenda(emaitzak = platerak.map((p, i) => ({p, i}))) {
    if (!emaitzak.length) return `<p>Ez da platerik aurkitu.</p>`;
    return emaitzak.map(({p, i}) => `<div class="platera" onclick="erakutsiPlaterarenXehetasunak(${i})" style="cursor:pointer">
        ${p.irudia ? `<img src="${p.irudia}" alt="${p.izena}" class="platerIrudia">` : ""}
        <h3>${p.izena}</h3>
        <p>📂 ${p.kategoria}${p.denbora ? ` · ⏱️ ${p.denbora}` : ""}</p>
        ${(p.etiketak || []).includes("Gogokoa") ? `<span>❤️ Gogokoa</span>` : ""}
    </div>`).join("");
}

function erakutsiPlaterarenXehetasunak(i) {
    const p = platerak[i];
    const osagaiak = p.osagaiak.length ? `<ul>${p.osagaiak.map(o => `<li>${o.izena}${o.kantitatea !== null || o.unitatea ? ` — ${[o.kantitatea,o.unitatea].filter(x => x !== null && x !== "").join(" ")}` : ""}</li>`).join("")}</ul>` : `<p>Ez dago osagairik gehituta.</p>`;
    const etiketak = p.etiketak.length ? p.etiketak.map(e => `<span>🏷️ ${e}</span>`).join(" &nbsp;") : `<p>Ez dago etiketarik.</p>`;
    const denbora = p.denbora ? `<h3>⏱️ Denbora</h3><p>${p.denbora}</p>` : "";
    const pdf = p.pdf ? `<h3>📄 Errezeta</h3><button onclick="irekiPdfa('${p.pdf}')">📄 PDFa ireki</button>` : "";
    document.getElementById("edukia").innerHTML = `<button onclick="erakutsiPlaterak()">↩️ Plateretara itzuli</button><h2>🍽️ ${p.izena}</h2>${p.irudia ? `<img src="${p.irudia}" alt="${p.izena}" class="platerIrudia">` : ""}<h3>📂 Kategoria</h3><p>${p.kategoria}</p>${denbora}<h3>🏷️ Etiketak</h3><p>${etiketak}</p><h3>🥕 Osagaiak</h3>${osagaiak}${pdf}<br><br><button onclick="editatuPlatera(${i})">✏️ Editatu platera</button><button onclick="ezabatuPlatera(${i})">🗑️ Ezabatu platera</button>`;
}

function editatuPlatera(i) {
    const p = platerak[i];
    let osagaiak = p.osagaiak.map(o => {
        let aukerak = `<option value="">Aukeratu osagaia</option>`;
        osagaienKatalogoa.forEach((k,j) => aukerak += `<option value="${j}" ${k.id===o.osagaiaId?"selected":""}>${k.izena}</option>`);
        return `<div class="osagaia"><br><select class="osagaiKatalogokoAukera" onchange="aldatuOsagaiMota(this)">${aukerak}<option value="BERRIA">➕ Osagai berria...</option></select><input type="text" class="osagaiBerriarenIzena" placeholder="Osagai berriaren izena" style="display:none"><input type="number" class="osagaiKantitatea" value="${o.kantitatea===null?"":o.kantitatea}" min="0" step="any">${sortuUnitateEremua(o.unitatea)}<button type="button" onclick="this.parentElement.remove()">❌</button></div>`;
    }).join("") || sortuOsagaiBerria();
    document.getElementById("edukia").innerHTML = `<h2>✏️ Platera editatu</h2><label>Plateraren izena:</label><br><input type="text" id="editatuPlaterIzena" value="${p.izena}"><br><br><label>Kategoria:</label><br><select id="editatuPlaterKategoria"><option value="Lehenengoa" ${p.kategoria==="Lehenengoa"?"selected":""}>Lehenengoa</option><option value="Bigarrena" ${p.kategoria==="Bigarrena"?"selected":""}>Bigarrena</option><option value="Postrea" ${p.kategoria==="Postrea"?"selected":""}>Postrea</option></select><br><br><label>⏱️ Denbora (aukerakoa):</label><br><input type="text" id="editatuPlaterDenbora" value="${p.denbora || ""}" placeholder="Adib. 30 minutu"><br><br><h3>🏷️ Etiketak</h3>${["Begetarianoa","Beganoa","Glutenik gabea","Laktosarik gabea","Gogokoa"].map(e=>`<label><input type="checkbox" value="${e}" class="editatuEtiketa" ${p.etiketak.includes(e)?"checked":""}>${e}</label><br>`).join("")}<h3>🥕 Osagaiak</h3><div id="editatuOsagaienZerrenda">${osagaiak}</div><br><button onclick="gehituEditatuOsagaia()">➕ Beste osagai bat</button><br><br><button onclick="gordeEditatutakoPlatera(${i})">💾 Aldaketak gorde</button><button onclick="erakutsiPlaterarenXehetasunak(${i})">↩️ Utzi</button>`;
}

function gehituEditatuOsagaia() {
    const z = document.getElementById("editatuOsagaienZerrenda"), d = document.createElement("div"); d.className="osagaia";
    let a=`<option value="">Aukeratu osagaia</option>`; osagaienKatalogoa.forEach((o,i)=>a+=`<option value="${i}">${o.izena}</option>`);
    d.innerHTML=`<br><select class="osagaiKatalogokoAukera" onchange="aldatuOsagaiMota(this)">${a}<option value="BERRIA">➕ Osagai berria...</option></select><input type="text" class="osagaiBerriarenIzena" placeholder="Osagai berriaren izena" style="display:none"><input type="number" class="osagaiKantitatea" placeholder="Kantitatea" min="0" step="any">${sortuUnitateEremua()}<button type="button" onclick="this.parentElement.remove()">❌</button>`; z.appendChild(d);
}

function gordeEditatutakoPlatera(i) {
    const p=platerak[i], izena=document.getElementById("editatuPlaterIzena").value;
    if(!izena.trim()) return alert("Mesedez, idatzi plateraren izena.");
    p.izena=izena.trim(); p.kategoria=document.getElementById("editatuPlaterKategoria").value; p.denbora=document.getElementById("editatuPlaterDenbora")?.value.trim() || ""; p.etiketak=[...document.querySelectorAll(".editatuEtiketa:checked")].map(e=>e.value); p.osagaiak=irakurriOsagaiak("#editatuOsagaienZerrenda"); gordeDatuak();
    alert("Platera eguneratu da! ✅"); erakutsiPlaterarenXehetasunak(i);
}

function ezabatuPlatera(i) {
    const p=platerak[i]; if(!confirm(`Ziur zaude "${p.izena}" ezabatu nahi duzula?`)) return;
    if(p.irudia) URL.revokeObjectURL(p.irudia); if(p.pdf) URL.revokeObjectURL(p.pdf); platerak.splice(i,1); gordeDatuak(); alert("Platera ezabatu da. 🗑️"); erakutsiPlaterak();
}
function irekiPdfa(url){ window.open(url,"_blank"); }

// ========================================
// KATALOGOA
// ========================================
function erakutsiOsagaienKatalogoa() {
    const z = osagaienKatalogoa.length ? osagaienKatalogoa.map((o,i)=>`<div class="platera"><h3>🥕 ${o.izena}</h3><button onclick="ezabatuKatalogokoOsagaia(${i})">🗑️ Ezabatu</button></div>`).join("") : `<p>Oraindik ez dago osagairik katalogoan.</p>`;
    document.getElementById("edukia").innerHTML=`<button onclick="erakutsiPlaterak()">↩️ Plateretara itzuli</button><h2>🥕 Osagaien katalogoa</h2><p>Hemen gordeko ditugu etxean erabiltzen ditugun osagai guztiak.</p><h3>➕ Osagai berria</h3><input type="text" id="osagaiBerriarenIzena" placeholder="Adib. Tomatea"><button onclick="gehituKatalogokoOsagaia()">➕ Gehitu</button><div>${z}</div>`;
}
function gehituKatalogokoOsagaia(){ const input=document.getElementById("osagaiBerriarenIzena"), izena=input.value.trim(); if(!izena)return alert("Mesedez, idatzi osagaiaren izena."); if(osagaienKatalogoa.some(o=>o.izena.toLowerCase()===izena.toLowerCase()))return alert("Osagai hori dagoeneko katalogoan dago."); osagaienKatalogoa.push({id:Date.now()+Math.random(),izena}); gordeDatuak(); alert(`"${izena}" katalogora gehitu da. 🥕`); erakutsiOsagaienKatalogoa(); }
function ezabatuKatalogokoOsagaia(i){ const o=osagaienKatalogoa[i]; if(platerak.some(p=>p.osagaiak.some(po=>po.osagaiaId===o.id))) return alert("Osagai hau plater batean erabiltzen ari da. Lehenengo plater horretatik kendu behar duzu."); if(!confirm(`Ziur zaude "${o.izena}" ezabatu nahi duzula?`))return; osagaienKatalogoa.splice(i,1); gordeDatuak(); erakutsiOsagaienKatalogoa(); }

// ========================================
// ASTE-PLANGINTZA
// ========================================
function erakutsiPlangintza(){
    const edukia=document.getElementById("edukia"), astea=lortuAsteHasiera(new Date());
    const egunak=["Astelehena","Asteartea","Asteazkena","Osteguna","Ostirala","Larunbata","Igandea"];
    let html=`<h2>📅 Aste-plangintza</h2><p>Aukeratu egun bakoitzeko bazkaria eta afaria.</p>`;
    egunak.forEach((izena,i)=>{ const data=gehituEgunak(astea,i), g=dataGakoaSortu(data); html+=`<div class="platera"><h3>${izena} — ${formatuData(data)}</h3><label>🍽️ Bazkaria:</label><br>${sortuPlangintzaAukera(g,"bazkaria")}<br><br><label>🌙 Afaria:</label><br>${sortuPlangintzaAukera(g,"afaria")}</div>`; });
    html+=`<br><button onclick="gordePlangintza()">💾 Gorde astea</button><button onclick="sortuErosketaZerrendaAstetik()">🛒 Erosketa-zerrenda sortu</button>`; edukia.innerHTML=html;
}
function lortuAsteHasiera(data){ const e=new Date(data), eguna=e.getDay(), d=eguna===0?-6:1-eguna; e.setDate(e.getDate()+d); e.setHours(0,0,0,0); return e; }
function gehituEgunak(data,n){ const e=new Date(data); e.setDate(e.getDate()+n); return e; }
function dataGakoaSortu(data){ return `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,"0")}-${String(data.getDate()).padStart(2,"0")}`; }
function formatuData(data){ return `${String(data.getDate()).padStart(2,"0")}/${String(data.getMonth()+1).padStart(2,"0")}`; }
function sortuPlangintzaAukera(dataGakoa,otordua){
    const gakoa=`${dataGakoa}_${otordua}`, gordeta=astePlangintza[gakoa]; let h=`<select id="plangintza_${gakoa}"><option value="">Aukeratu...</option>`;
    if(platerak.length){ h+=`<optgroup label="🍽️ Platerak">`; platerak.forEach(p=>h+=`<option value="PLATERA:${p.id}" ${gordeta===`PLATERA:${p.id}`?"selected":""}>${p.izena}</option>`); h+=`</optgroup>`; }
    h+=`<optgroup label="🏠 Beste aukerak">`; plangintzaAukerak.forEach(a=>{ const balioa=`BESTEA:${a}`, ikonoa=a==="Tupperra"?"🥡 ":a==="Soberakinak"?"♻️ ":a==="Kanpoan jan"?"🍴 ":a==="Etxean jan - beste bat"?"🏠 ":"— "; h+=`<option value="${balioa}" ${gordeta===balioa?"selected":""}>${ikonoa}${a}</option>`; }); return h+`</optgroup></select>`;
}
function gordePlangintza(){
    const astea=lortuAsteHasiera(new Date());
    for(let i=0;i<7;i++){ const g=dataGakoaSortu(gehituEgunak(astea,i)); for(const o of ["bazkaria","afaria"]){ const el=document.getElementById(`plangintza_${g}_${o}`); if(!el)continue; const k=`${g}_${o}`; if(el.value)astePlangintza[k]=el.value; else delete astePlangintza[k]; } }
    gordeDatuak();
    alert("Aste-plangintza gordeta! 📅✅");
}
function bihurtuNeurria(kantitatea, unitatea) {
    const u = String(unitatea || "").toLowerCase().trim();
    const n = Number(kantitatea);
    if (!Number.isFinite(n)) return null;
    if (u === "g") return { kantitatea: n / 1000, unitatea: "kg" };
    if (u === "kg") return { kantitatea: n, unitatea: "kg" };
    if (u === "ml") return { kantitatea: n / 1000, unitatea: "l" };
    if (u === "l") return { kantitatea: n, unitatea: "l" };
    return { kantitatea: n, unitatea: u };
}

function txukunduKantitatea(n) {
    if (!Number.isFinite(n)) return "";
    return Number(n.toFixed(3)).toString();
}

function sortuErosketaZerrendaAstetik(){
    gordePlangintza();
    const batuak = {};

    Object.values(astePlangintza).forEach(aukera => {
        if (!aukera.startsWith("PLATERA:")) return;
        const id = aukera.substring("PLATERA:".length);
        const p = platerak.find(x => String(x.id) === id);
        if (!p) return;

        p.osagaiak.forEach(o => {
            const neurketa = (o.kantitatea !== null && o.kantitatea !== "" && o.kantitatea !== undefined)
                ? bihurtuNeurria(o.kantitatea, o.unitatea)
                : null;

            const oinarrizkoUnitatea = neurketa?.unitatea || (o.unitatea || "");
            const unitateGakoa = ["g", "kg"].includes(o.unitatea) ? "kg"
                : ["ml", "l"].includes(o.unitatea) ? "l"
                : oinarrizkoUnitatea;
            const k = `${o.osagaiaId}__${unitateGakoa}`;

            if (!batuak[k]) {
                batuak[k] = {
                    id: k,
                    osagaiaId: o.osagaiaId,
                    izena: o.izena,
                    kantitatea: 0,
                    unitatea: oinarrizkoUnitatea,
                    kantitateaDago: false
                };
            }

            if (neurketa) {
                batuak[k].kantitatea += neurketa.kantitatea;
                batuak[k].kantitateaDago = true;
            }
        });
    });

    const aurrekoMarkatuak = new Map(erosketaZerrenda.map(o => [String(o.id), !!o.eginda]));
    erosketaZerrenda = Object.values(batuak).map(o => ({
        ...o,
        kantitatea: txukunduKantitatea(o.kantitatea),
        eginda: aurrekoMarkatuak.get(String(o.id)) || false
    }));

    gordeDatuak();
    erakutsiErosketaZerrenda();
}

function erakutsiErosketaZerrenda(){
    const edukia = document.getElementById("edukia");

    if (!erosketaZerrenda.length) {
        edukia.innerHTML = `<h2>🛒 Erosketa-zerrenda</h2>
            <p>Oraindik ez dago erosketen zerrendarik.</p>
            <button onclick="erakutsiPlangintza()">📅 Aste-plangintza</button>`;
        return;
    }

    const zerrenda = erosketaZerrenda.map((o, i) => {
        let neurketa = "";
        if (o.kantitateaDago) neurketa = ` — ${o.kantitatea} ${o.unitatea}`;
        else if (o.unitatea) neurketa = ` — ${o.unitatea}`;
        return `<li>
            <label>
                <input type="checkbox" ${o.eginda ? "checked" : ""} onchange="aldatuErosketaMarka(${i}, this.checked)">
                ${o.izena}${neurketa}
            </label>
        </li>`;
    }).join("");

    edukia.innerHTML = `<h2>🛒 Erosketa-zerrenda</h2>
        <p>Aste-plangintzako plateretatik sortua eta gailu honetan gordeta.</p>
        <ul>${zerrenda}</ul>
        <br>
        <button onclick="sortuErosketaZerrendaAstetik()">🔄 Eguneratu zerrenda</button>
        <button onclick="garbituErosketaZerrenda()">🗑️ Garbitu</button>
        <button onclick="erakutsiPlangintza()">📅 Aste-plangintza</button>`;
}

function aldatuErosketaMarka(indizea, eginda){
    if (!erosketaZerrenda[indizea]) return;
    erosketaZerrenda[indizea].eginda = eginda;
    gordeDatuak();
}

function garbituErosketaZerrenda(){
    if (!confirm("Erosketa-zerrenda garbitu nahi duzu?")) return;
    erosketaZerrenda = [];
    gordeDatuak();
    erakutsiErosketaZerrenda();
}


function erakutsiEtxekoOharrak(){
 const edukia=document.getElementById("edukia");
 const ordenatu=[...etxekoOharrak.map((o,i)=>({o,i}))].sort((a,b)=>Number(b.o.finkatuta)-Number(a.o.finkatuta));
 const koloreKlasea=o=>({horia:"oharHoria",urdina:"oharUrdina",berdea:"oharBerdea",gorria:"oharGorria"})[o.kolorea]||"";
 const zerrenda=ordenatu.length?ordenatu.map(({o,i})=>`<div class="oharTxartela ${o.finkatuta?"oharFinkatua ":""}${koloreKlasea(o)}" onclick="irekiOharra(${i})"><div class="oharEdukiNagusia"><h3>${o.mota==="checklist"?"☑️":"📝"} ${ihesTestua(o.izenburua||"Oharra")}</h3><p class="oharLaburpena">${o.mota==="checklist"?"Checklist — "+(o.elementuak||[]).filter(e=>e.eginda).length+"/"+(o.elementuak||[]).length:"Oharra"}</p></div><div class="oharTxartelBotoiak"><button title="Finkatu" onclick="event.stopPropagation();txandakatuOharFinkatua(${i})">${o.finkatuta?"📌":"📍"}</button><button title="Ezabatu" onclick="event.stopPropagation();ezabatuOharra(${i})">🗑️</button></div></div>`).join(""):"<p>Oraindik ez dago oharrik.</p>";
 edukia.innerHTML=`<h2>📝 Etxeko oharrak</h2><p>Oharrak edo checklistak sortu eta gorde ditzakezu.</p><div class="oharBotoiak"><button onclick="sortuOharra('oharra')">➕ Oharra</button><button onclick="sortuOharra('checklist')">☑️ Checklist berria</button></div><div class="oharrenZerrenda">${zerrenda}</div>`;
}
function sortuOharra(mota,indizea=null){
 const o=indizea===null?(mota==="checklist"?{mota,izenburua:"",elementuak:[{testua:"",eginda:false}],finkatuta:false}:{mota,izenburua:"",testua:"",finkatuta:false}):etxekoOharrak[indizea]; if(!o)return;
 const edukia=document.getElementById("edukia");
 if(mota==="checklist"){edukia.innerHTML=`<h2>☑️ Checklist</h2><input type="text" id="oharIzenburua" placeholder="Adib. Erosketak" value="${ihesTestua(o.izenburua||"")}"><div id="checklistElementuak" class="checklistElementuak">${(o.elementuak||[]).map((e,ei)=>`<div class="checklistElementua"><input type="checkbox" class="checkItem" data-elementu-indizea="${ei}" ${e.eginda?"checked":""} onchange="aldatuChecklistElementua(this)"><input type="text" class="checkItemTestua" placeholder="Zeregina" value="${ihesTestua(e.testua||"")}"><button type="button" onclick="this.parentElement.remove()">🗑️</button></div>`).join("")}</div><button onclick="gehituChecklistElementua()">➕ Beste elementu bat</button><br><br><button onclick="gordeOharra(${indizea===null?"null":indizea},'checklist')">💾 Gorde</button><button onclick="erakutsiEtxekoOharrak()">↩️ Itzuli</button>`;}
 else{edukia.innerHTML=`<h2>📝 Oharra</h2><input type="text" id="oharIzenburua" placeholder="Adib. Gaur egin beharrekoak" value="${ihesTestua(o.izenburua||"")}"><div class="oharKoloreak"><button type="button" class="${(o.kolorea||"normala")==="normala"?"aukeratua":""}" onclick="aukeratuOharKolorea('normala')">⚪</button><button type="button" class="${o.kolorea==="horia"?"aukeratua":""}" onclick="aukeratuOharKolorea('horia')">🟡</button><button type="button" class="${o.kolorea==="urdina"?"aukeratua":""}" onclick="aukeratuOharKolorea('urdina')">🔵</button><button type="button" class="${o.kolorea==="berdea"?"aukeratua":""}" onclick="aukeratuOharKolorea('berdea')">🟢</button><button type="button" class="${o.kolorea==="gorria"?"aukeratua":""}" onclick="aukeratuOharKolorea('gorria')">🔴</button></div><textarea id="oharTestua" rows="12" placeholder="Idatzi zure oharra hemen...">${ihesTestua(o.testua||"")}</textarea><br><button onclick="gordeOharra(${indizea===null?"null":indizea},'oharra')">💾 Gorde</button><button onclick="erakutsiEtxekoOharrak()">↩️ Itzuli</button>`;}
 window._oharIndizea=indizea; window._oharKolorea= o.kolorea||"normala";
}
function aukeratuOharKolorea(kolorea){window._oharKolorea=kolorea;document.querySelectorAll(".oharKoloreak button").forEach(b=>b.classList.remove("aukeratua"));const map={normala:0,horia:1,urdina:2,berdea:3,gorria:4};document.querySelectorAll(".oharKoloreak button")[map[kolorea]]?.classList.add("aukeratua");}
function aldatuChecklistElementua(el){el.classList.toggle("checkEginDa",el.checked);const testua=el.parentElement.querySelector(".checkItemTestua");if(testua)testua.classList.toggle("checkEginDa",el.checked);const indizea=window._oharIndizea;const elementuIndizea=Number(el.dataset.elementuIndizea);if(indizea!==null&&indizea!==undefined&&Number.isInteger(elementuIndizea)&&etxekoOharrak[indizea]?.elementuak?.[elementuIndizea]){etxekoOharrak[indizea].elementuak[elementuIndizea].eginda=el.checked;gordeDatuak();erakutsiEtxekoOharrak();}}
function gehituChecklistElementua(){const z=document.getElementById("checklistElementuak");if(!z)return;const e=document.createElement("div");e.className="checklistElementua";e.innerHTML='<input type="checkbox" class="checkItem" data-elementu-indizea="NEW" onchange="aldatuChecklistElementua(this)"><input type="text" class="checkItemTestua" placeholder="Zeregina"><button type="button" onclick="this.parentElement.remove()">🗑️</button>';z.appendChild(e);}
function gordeOharra(indizea,mota){
 const izenburua=document.getElementById("oharIzenburua")?.value.trim()||(mota==="checklist"?"Checklist":"Oharra");let o;
 if(mota==="checklist"){const elementuak=[...document.querySelectorAll("#checklistElementuak .checklistElementua")].map(el=>({testua:el.querySelector(".checkItemTestua")?.value.trim()||"",eginda:!!el.querySelector(".checkItem")?.checked})).filter(e=>e.testua);const zaharra=indizea===null?null:etxekoOharrak[indizea];o={mota,izenburua,elementuak,finkatuta:zaharra?.finkatuta||false};}
 else{const zaharra=indizea===null?null:etxekoOharrak[indizea];o={mota,izenburua,testua:document.getElementById("oharTestua")?.value||"",kolorea:window._oharKolorea||zaharra?.kolorea||"normala",finkatuta:zaharra?.finkatuta||false};}
 if(indizea===null)etxekoOharrak.push(o);else etxekoOharrak[indizea]=o;gordeDatuak();erakutsiEtxekoOharrak();
}
function txandakatuOharFinkatua(i){if(!etxekoOharrak[i])return;etxekoOharrak[i].finkatuta=!etxekoOharrak[i].finkatuta;gordeDatuak();erakutsiEtxekoOharrak();}
function irekiOharra(i){const o=etxekoOharrak[i];if(o)sortuOharra(o.mota,i);}
function ezabatuOharra(i){if(!etxekoOharrak[i]||!confirm("Ohar hau ezabatu nahi duzu?"))return;etxekoOharrak.splice(i,1);gordeDatuak();erakutsiEtxekoOharrak();}
// ========================================
// SPOTIFY ERREPRODUKZIO-ZERRENDAK
// ========================================
let spotifyZerrendak = [];
const SPOTIFY_GAKOA = "gure_etxea_spotify_zerrendak_v1";

function kargatuSpotifyZerrendak() {
    try {
        const gordeta = localStorage.getItem(SPOTIFY_GAKOA);
        spotifyZerrendak = gordeta ? JSON.parse(gordeta) : [];
        if (!Array.isArray(spotifyZerrendak)) spotifyZerrendak = [];
    } catch (errorea) {
        spotifyZerrendak = [];
    }
}

function gordeSpotifyZerrendak() {
    localStorage.setItem(SPOTIFY_GAKOA, JSON.stringify(spotifyZerrendak));
    programatuSupabaseSinkronizazioa();
}

kargatuSpotifyZerrendak();

function erakutsiMusika() {
    const edukia = document.getElementById("edukia");
    const zerrendaHtml = spotifyZerrendak.length === 0
        ? "<p>Oraindik ez dago Spotify erreprodukzio-zerrendarik.</p>"
        : spotifyZerrendak.map((zerrenda, indizea) => `
            <div class="spotifyZerrenda">
                <button class="spotifyZerrendaIreki" onclick="irekiSpotifyZerrenda(${indizea})">
                    <div class="spotifyZerrendaIkonoa">🎵</div>
                    <div class="spotifyZerrendaInfoa">
                        <h3>${ihesTestua(zerrenda.izena)}</h3>
                        <p>Spotify-n ireki →</p>
                    </div>
                </button>
                <div class="spotifyZerrendaBotoiak">
                    <button title="Aldatu" onclick="editatuSpotifyZerrenda(${indizea})">✏️</button>
                    <button title="Ezabatu" onclick="ezabatuSpotifyZerrenda(${indizea})">🗑️</button>
                </div>
            </div>
        `).join("");

    edukia.innerHTML = `
        <h2>🎵 Erreprodukzio-zerrendak</h2>
        <p>Gorde etxeko Spotify playlist gogokoenak eta ireki zuzenean Spotify-n.</p>
        <div class="spotifyZerrendenZerrenda">${zerrendaHtml}</div>
        <hr>
        <h3>➕ Spotify zerrenda gehitu</h3>
        <input type="text" id="spotifyIzena" placeholder="Adib. Afalosteko musika">
        <input type="url" id="spotifyEsteka" placeholder="https://open.spotify.com/playlist/...">
        <button onclick="gehituSpotifyZerrenda()">💾 Gehitu</button>
    `;
}

function gehituSpotifyZerrenda() {
    const izena = document.getElementById("spotifyIzena")?.value.trim() || "";
    const esteka = document.getElementById("spotifyEsteka")?.value.trim() || "";
    if (!izena) { alert("Idatzi erreprodukzio-zerrendaren izena."); return; }
    if (!/^https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]+/.test(esteka)) {
        alert("Spotify playlist baten esteka zuzena behar da."); return;
    }
    spotifyZerrendak.push({ id: Date.now(), izena, esteka });
    gordeSpotifyZerrendak();
    erakutsiMusika();
}

function editatuSpotifyZerrenda(indizea) {
    const z = spotifyZerrendak[indizea];
    if (!z) return;
    const edukia = document.getElementById("edukia");
    edukia.innerHTML = `
        <h2>✏️ Spotify zerrenda aldatu</h2>
        <input type="text" id="spotifyIzenaEditatu" value="${ihesTestua(z.izena)}" placeholder="Zerrendaren izena">
        <input type="url" id="spotifyEstekaEditatu" value="${ihesTestua(z.esteka)}" placeholder="Spotify playlistaren esteka">
        <br><br>
        <button onclick="gordeSpotifyZerrendaAldaketa(${indizea})">💾 Gorde</button>
        <button onclick="erakutsiMusika()">↩️ Itzuli</button>
    `;
}

function gordeSpotifyZerrendaAldaketa(indizea) {
    const z = spotifyZerrendak[indizea];
    if (!z) return;
    const izena = document.getElementById("spotifyIzenaEditatu")?.value.trim() || "";
    const esteka = document.getElementById("spotifyEstekaEditatu")?.value.trim() || "";
    if (!izena) { alert("Idatzi erreprodukzio-zerrendaren izena."); return; }
    if (!/^https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]+/.test(esteka)) {
        alert("Spotify playlist baten esteka zuzena behar da."); return;
    }
    spotifyZerrendak[indizea] = { ...z, izena, esteka };
    gordeSpotifyZerrendak();
    erakutsiMusika();
}

function ezabatuSpotifyZerrenda(indizea) {
    if (!spotifyZerrendak[indizea]) return;
    if (!confirm("Spotify zerrenda hau ezabatu nahi duzu?")) return;
    spotifyZerrendak.splice(indizea, 1);
    gordeSpotifyZerrendak();
    erakutsiMusika();
}

function irekiSpotifyZerrenda(indizea) {
    const zerrenda = spotifyZerrendak[indizea];
    if (!zerrenda) return;
    window.location.href = zerrenda.esteka;
}

function ihesTestua(testua) {
    return String(testua)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Aurreko erakutsiAtala funtzioaren Spotify atala ordezkatu.
const _erakutsiAtala = erakutsiAtala;
erakutsiAtala = function(atala) {
    if (atala === "musika") {
        erakutsiMusika();
        return;
    }
    _erakutsiAtala(atala);
};

// ========================================
// APLIKAZIOA INSTALATZEA (PWA)
// ========================================
let instalatzekoGonbita = null;

window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    instalatzekoGonbita = event;
    erakutsiInstalatzekoBotoia();
});

function erakutsiInstalatzekoBotoia() {
    if (document.getElementById("instalatuAplikazioa")) return;

    const botoia = document.createElement("button");
    botoia.id = "instalatuAplikazioa";
    botoia.className = "instalatuAplikazioa";
    botoia.textContent = "📲 Instalatu Gure etxea";
    botoia.onclick = instalatuAplikazioa;
    document.body.appendChild(botoia);
}

async function instalatuAplikazioa() {
    if (!instalatzekoGonbita) return;

    instalatzekoGonbita.prompt();
    await instalatzekoGonbita.userChoice;
    instalatzekoGonbita = null;

    const botoia = document.getElementById("instalatuAplikazioa");
    if (botoia) botoia.remove();
}

window.addEventListener("appinstalled", () => {
    const botoia = document.getElementById("instalatuAplikazioa");
    if (botoia) botoia.remove();
});

