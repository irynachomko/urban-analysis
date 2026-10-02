/**
 * ============================================================================
 *  ІНТЕРАКТИВНА КАРТА КВАРТАЛУ  —  App.jsx
 * ============================================================================
 *  Встановлення залежностей:
 *    npm i leaflet react-leaflet lucide-react
 *  (Tailwind CSS має бути вже підключений у проєкті.)
 *
 *  Файл карти: покладіть своє зображення у  public/map.png
 *  (у Vite/CRA воно буде доступне за шляхом "/map.png").
 *
 *  Що вміє:
 *   - Зображення = карта (L.imageOverlay), зум і перетягування
 *   - Клік по будинку → бічна панель + фокус карти на ньому
 *   - Пошук, фільтри категорій, додавання/редагування/видалення об'єктів
 *   - Фото за URL або з комп'ютера (Base64, стискається перед збереженням)
 *   - Усе зберігається в localStorage
 * ============================================================================
 */

import { useState, useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  ImageOverlay,
  Polygon,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Search,
  Plus,
  X,
  Pencil,
  Trash2,
  ImagePlus,
  Link as LinkIcon,
  Building2,
  Store,
  ParkingSquare,
  MapPin,
  Move,
  RotateCcw,
} from "lucide-react";

/* ============================================================================
 *  1. НАЛАШТУВАННЯ ЗОБРАЖЕННЯ-КАРТИ
 * ============================================================================
 *  ВАЖЛИВО: вкажіть ТОЧНІ розміри вашого зображення в пікселях.
 *  (Правий клік на файлі → "Властивості" → "Докладно".)
 *  Зараз стоять розміри доданого скриншота.
 */
const MAP_URL = "/map.png";
const IMG_W = 1365; // ширина зображення, px
const IMG_H = 1254; // висота зображення, px

/**
 * Leaflet у режимі CRS.Simple працює з координатами [y, x], де (0,0) — ЛІВИЙ
 * НИЖНІЙ кут зображення, а y росте ВГОРУ. Це незручно, коли ви дивитесь на
 * картинку в графічному редакторі, де (0,0) — лівий ВЕРХНІЙ кут, а y росте ВНИЗ.
 *
 * Тому в даних ми зберігаємо точки в "піксельних" координатах редактора —
 * [x, y] від лівого верхнього кута, — а цією функцією перетворюємо їх
 * у координати Leaflet.
 */
const toLatLng = ([x, y]) => [IMG_H - y, x];
const fromLatLng = ([lat, lng]) => [lng, IMG_H - lat];

// Межі картинки в координатах Leaflet: [[низ-ліво], [верх-право]]
const IMAGE_BOUNDS = [
  [0, 0],
  [IMG_H, IMG_W],
];

/* ============================================================================
 *  2. КАТЕГОРІЇ
 * ============================================================================ */
const CATEGORIES = {
  residential: { label: "Житлові", color: "#2f5d8a", Icon: Building2 },
  commerce: { label: "Комерція", color: "#c9741a", Icon: Store },
  parking: { label: "Паркінг", color: "#5b6670", Icon: ParkingSquare },
};

const FILTERS = [
  { key: "all", label: "Усі" },
  { key: "residential", label: "Житлові" },
  { key: "commerce", label: "Комерція" },
  { key: "parking", label: "Паркінг" },
];

/* ============================================================================
 *  3. ТЕСТОВІ ДАНІ  (ТУТ НАЛАШТОВУЮТЬСЯ КООРДИНАТИ ОБ'ЄКТІВ)
 * ============================================================================
 *  Кожен об'єкт має поле  polygon  — масив точок [x, y] у пікселях
 *  зображення, відлік від ЛІВОГО ВЕРХНЬОГО кута (як у Paint / Photoshop / Figma).
 *
 *  Як підібрати координати для свого будинку:
 *   1. Відкрийте map.png у будь-якому редакторі (Paint підходить).
 *   2. Наведіть курсор на кут будинку — внизу буде видно "x, y".
 *   3. Запишіть 4+ кутів по колу (за годинниковою стрілкою) → [[x1,y1],[x2,y2],...]
 *
 *  Або простіше: додайте об'єкт через кнопку "+ Додати об'єкт" і
 *  перемістіть його кліком на карті ("Перемістити на карті").
 *  Нові координати збережуться в localStorage.
 *
 *  Значення нижче — приблизні, під доданий скриншот; за потреби підкоригуйте.
 */
const DEFAULT_BUILDINGS = [
  {
    id: "b1",
    name: "Будинок 7-А / 7-Б",
    number: "вул. Дмитра Яворницького, 7",
    category: "residential",
    status: "Заселений",
    description:
      "Витягнутий житловий будинок вздовж внутрішнього проїзду. Є двір із дитячим майданчиком.",
    features: ["Поверхів: 9", "Під'їздів: 4", "Двір без авто"],
    photos: [],
    polygon: [
      [636, 380],
      [668, 372],
      [772, 556],
      [740, 566],
    ],
  },
  {
    id: "b2",
    name: "Житловий будинок 29-Б",
    number: "вул. Антона Головатого, 29-Б",
    category: "residential",
    status: "Заселений",
    description: "Будинок біля перетину з вул. Вука Караджича, поруч зупинка та аптека.",
    features: ["Поверхів: 5", "Ліфт: немає", "Є підвал"],
    photos: [],
    polygon: [
      [436, 226],
      [492, 216],
      [572, 376],
      [522, 392],
      [462, 300],
    ],
  },
  {
    id: "b3",
    name: "Будинок Меблів",
    number: "вул. Дмитра Яворницького / Любінська",
    category: "commerce",
    status: "Працює щодня",
    description: "Торговий центр з меблевими салонами та великою парковкою навпроти.",
    features: ["Години: 10:00–20:00", "Парковка: є", "Кафе на 1 поверсі"],
    photos: [],
    polygon: [
      [1132, 600],
      [1292, 532],
      [1306, 602],
      [1200, 692],
      [1136, 650],
    ],
  },
  {
    id: "b4",
    name: "Паркінг біля Паровозної",
    number: "вул. Паровозна",
    category: "parking",
    status: "Відкритий",
    description: "Відкритий майданчик для паркування. Вільні місця зазвичай є вранці та вдень.",
    features: ["Місць: ~30", "Тип: відкритий", "Вартість: безкоштовно"],
    photos: [],
    polygon: [
      [1002, 322],
      [1064, 316],
      [1068, 368],
      [1006, 372],
    ],
  },
];

const STORAGE_KEY = "quarter-map-v1";

/* ============================================================================
 *  4. ДОПОМІЖНІ ФУНКЦІЇ
 * ============================================================================ */

// Читаємо дані з localStorage (або повертаємо тестові)
function loadBuildings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Не вдалося прочитати localStorage:", e);
  }
  return DEFAULT_BUILDINGS;
}

// Файл → Base64 із зменшенням (щоб не переповнити ліміт localStorage ~5 МБ)
function fileToDataUrl(file, maxSide = 1000, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Це не зображення"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Центр багатокутника в піксельних координатах
function centroid(points) {
  const n = points.length;
  return [
    points.reduce((s, p) => s + p[0], 0) / n,
    points.reduce((s, p) => s + p[1], 0) / n,
  ];
}

// Пересуває багатокутник так, щоб його центр опинився в точці [cx, cy]
function moveTo(points, [cx, cy]) {
  const [ox, oy] = centroid(points);
  return points.map(([x, y]) => [x + cx - ox, y + cy - oy]);
}

// Прямокутник 70×45 px навколо точки — стартова форма нового об'єкта
function defaultRect([cx, cy]) {
  return [
    [cx - 35, cy - 22],
    [cx + 35, cy - 22],
    [cx + 35, cy + 22],
    [cx - 35, cy + 22],
  ];
}

const EMPTY_FORM = {
  id: null,
  name: "",
  number: "",
  category: "residential",
  status: "",
  description: "",
  featuresText: "",
  photos: [],
};

/* ============================================================================
 *  5. ДОПОМІЖНІ КОМПОНЕНТИ КАРТИ (працюють усередині <MapContainer>)
 * ============================================================================ */

// Фокус карти на вибраному будинку
function FocusOnSelected({ building }) {
  const map = useMap();
  useEffect(() => {
    if (!building) return;
    const bounds = L.latLngBounds(building.polygon.map(toLatLng));
    map.flyToBounds(bounds, { padding: [140, 140], maxZoom: 1, duration: 0.6 });
  }, [building?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Клік по порожньому місцю карти: або знімає вибір, або переміщує об'єкт
function MapClicks({ placing, onPlace, onEmptyClick }) {
  useMapEvents({
    click(e) {
      if (placing) onPlace(fromLatLng([e.latlng.lat, e.latlng.lng]));
      else onEmptyClick();
    },
  });
  return null;
}

/* ============================================================================
 *  6. ГОЛОВНИЙ КОМПОНЕНТ
 * ============================================================================ */
export default function App() {
  const [buildings, setBuildings] = useState(loadBuildings);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [placingId, setPlacingId] = useState(null); // id об'єкта, який зараз переміщуємо
  const [activePhoto, setActivePhoto] = useState(0);
  const [storageError, setStorageError] = useState(false);
  const mapRef = useRef(null);

  // --- Збереження в localStorage при кожній зміні ---
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buildings));
      setStorageError(false);
    } catch (e) {
      console.error(e);
      setStorageError(true); // найчастіше — переповнення через великі фото
    }
  }, [buildings]);

  // При виборі іншого будинку показуємо його перше фото
  useEffect(() => setActivePhoto(0), [selectedId]);

  const selected = buildings.find((b) => b.id === selectedId) || null;

  // --- Пошук + фільтр ---
  const visibleIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    return new Set(
      buildings
        .filter((b) => filter === "all" || b.category === filter)
        .filter(
          (b) =>
            !q ||
            b.name.toLowerCase().includes(q) ||
            b.number.toLowerCase().includes(q)
        )
        .map((b) => b.id)
    );
  }, [buildings, filter, query]);

  const searchHits = useMemo(
    () => buildings.filter((b) => visibleIds.has(b.id)),
    [buildings, visibleIds]
  );

  // --- Операції над даними ---
  const updateBuilding = (id, patch) =>
    setBuildings((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (b) => {
    setForm({
      id: b.id,
      name: b.name,
      number: b.number,
      category: b.category,
      status: b.status,
      description: b.description,
      featuresText: b.features.join("\n"),
      photos: b.photos,
    });
    setModalOpen(true);
  };

  const saveForm = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const features = form.featuresText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (form.id) {
      updateBuilding(form.id, {
        name: form.name.trim(),
        number: form.number.trim(),
        category: form.category,
        status: form.status.trim(),
        description: form.description.trim(),
        features,
        photos: form.photos,
      });
      setModalOpen(false);
    } else {
      // Новий об'єкт з'являється в ЦЕНТРІ поточного вигляду карти.
      // Потім його можна перемістити кліком ("Перемістити на карті").
      const c = mapRef.current?.getCenter();
      const center = c ? fromLatLng([c.lat, c.lng]) : [IMG_W / 2, IMG_H / 2];
      const id = "b" + Date.now();
      setBuildings((list) => [
        ...list,
        {
          id,
          name: form.name.trim(),
          number: form.number.trim(),
          category: form.category,
          status: form.status.trim(),
          description: form.description.trim(),
          features,
          photos: form.photos,
          polygon: defaultRect(center),
        },
      ]);
      setSelectedId(id);
      setPlacingId(id); // одразу вмикаємо режим розміщення
      setModalOpen(false);
    }
  };

  const deleteBuilding = (id) => {
    if (!window.confirm("Видалити цей об'єкт?")) return;
    setBuildings((list) => list.filter((b) => b.id !== id));
    setSelectedId(null);
  };

  const resetAll = () => {
    if (!window.confirm("Повернути початкові дані? Усі ваші зміни буде втрачено.")) return;
    setBuildings(DEFAULT_BUILDINGS);
    setSelectedId(null);
  };

  const addPhotoToSelected = async (file) => {
    if (!file || !selected) return;
    try {
      const url = await fileToDataUrl(file);
      updateBuilding(selected.id, { photos: [...selected.photos, url] });
      setActivePhoto(selected.photos.length);
    } catch (err) {
      alert(err.message);
    }
  };

  const removePhoto = (index) => {
    if (!selected) return;
    updateBuilding(selected.id, {
      photos: selected.photos.filter((_, i) => i !== index),
    });
    setActivePhoto(0);
  };

  /* ------------------------------------------------------------------------
   *  Стилі полігона: звичайний / при наведенні / вибраний / приглушений
   * ------------------------------------------------------------------------ */
  const polygonStyle = (b) => {
    const color = CATEGORIES[b.category].color;
    const isSel = b.id === selectedId;
    const isHover = b.id === hoveredId;
    const isVisible = visibleIds.has(b.id);
    return {
      color: isSel ? "#111827" : color,
      weight: isSel ? 4 : isHover ? 4 : 2,
      opacity: isVisible ? 1 : 0.25,
      fillColor: color,
      fillOpacity: !isVisible ? 0.05 : isSel ? 0.55 : isHover ? 0.5 : 0.25,
    };
  };

  return (
    <div className="flex h-screen flex-col bg-stone-100 text-stone-800" style={{ fontFamily: "'Onest', system-ui, sans-serif" }}>
      {/* Шрифт з підтримкою кирилиці + прибираємо білу рамку Leaflet під картою */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap');
        .leaflet-container { background: #e7e5e0; font-family: inherit; }
        .leaflet-interactive:focus { outline: none; }
        .leaflet-tooltip { font-weight: 600; border-radius: 6px; }
        .placing .leaflet-container { cursor: crosshair; }
      `}</style>

      {/* ====================== HEADER ====================== */}
      <header className="z-[1000] flex flex-wrap items-center gap-3 border-b border-stone-300 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2 pr-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2f5d8a] text-white">
            <MapPin size={20} />
          </span>
          <div className="leading-tight">
            <div className="text-base font-bold">Мій квартал</div>
            <div className="text-xs text-stone-500">інтерактивна карта</div>
          </div>
        </div>

        {/* Пошук */}
        <div className="relative w-full min-w-[200px] sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Назва або номер будинку"
            className="w-full rounded-lg border border-stone-300 bg-stone-50 py-2 pl-9 pr-8 text-sm outline-none focus:border-[#2f5d8a] focus:ring-2 focus:ring-[#2f5d8a]/20"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
              aria-label="Очистити пошук"
            >
              <X size={16} />
            </button>
          )}
          {/* Підказки пошуку */}
          {query.trim() && (
            <ul className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-auto rounded-lg border border-stone-200 bg-white shadow-lg">
              {searchHits.length === 0 && (
                <li className="px-3 py-2 text-sm text-stone-500">Нічого не знайдено</li>
              )}
              {searchHits.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => {
                      setSelectedId(b.id);
                      setQuery("");
                    }}
                    className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-stone-100"
                  >
                    <span className="font-medium">{b.name}</span>
                    <span className="text-xs text-stone-500">{b.number}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Фільтри */}
        <div className="flex gap-1 rounded-lg bg-stone-100 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                filter === f.key ? "bg-white shadow-sm text-[#2f5d8a]" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={openAdd}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#2f5d8a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#264d73]"
        >
          <Plus size={16} /> Додати об'єкт
        </button>
      </header>

      {storageError && (
        <div className="bg-red-50 px-4 py-2 text-sm text-red-700">
          Не вдалося зберегти зміни: сховище браузера заповнене. Видаліть кілька фото або використовуйте посилання (URL) замість файлів.
        </div>
      )}

      {/* ====================== MAIN ====================== */}
      <main className={`flex min-h-0 flex-1 flex-col md:flex-row ${placingId ? "placing" : ""}`}>
        {/* ---------- КАРТА ---------- */}
        <div className="relative min-h-[45vh] flex-1">
          <MapContainer
            ref={mapRef}
            crs={L.CRS.Simple} // плоска система координат для зображень
            bounds={IMAGE_BOUNDS}
            minZoom={-2}
            maxZoom={2}
            zoomSnap={0.25}
            maxBounds={[[-300, -300], [IMG_H + 300, IMG_W + 300]]}
            maxBoundsViscosity={0.8}
            className="h-full w-full"
            attributionControl={false}
          >
            {/* Ваше зображення як карта */}
            <ImageOverlay url={MAP_URL} bounds={IMAGE_BOUNDS} />

            {/* Будинки-полігони поверх зображення */}
            {buildings.map((b) => (
              <Polygon
                key={b.id + (b.id === selectedId ? "-s" : "")}
                positions={b.polygon.map(toLatLng)} // [x,y] → координати Leaflet
                pathOptions={polygonStyle(b)}
                eventHandlers={{
                  mouseover: () => setHoveredId(b.id),
                  mouseout: () => setHoveredId(null),
                  click: (e) => {
                    if (placingId) return; // у режимі розміщення клік обробляє MapClicks
                    L.DomEvent.stopPropagation(e);
                    setSelectedId(b.id);
                  },
                }}
              >
                <Tooltip sticky>{b.name}</Tooltip>
              </Polygon>
            ))}

            <FocusOnSelected building={selected} />
            <MapClicks
              placing={!!placingId}
              onPlace={(pt) => {
                const b = buildings.find((x) => x.id === placingId);
                if (b) updateBuilding(b.id, { polygon: moveTo(b.polygon, pt) });
                setPlacingId(null);
              }}
              onEmptyClick={() => setSelectedId(null)}
            />
          </MapContainer>

          {/* Підказка в режимі розміщення */}
          {placingId && (
            <div className="absolute left-1/2 top-3 z-[500] flex -translate-x-1/2 items-center gap-3 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">
              <Move size={16} /> Клікніть на карті, куди перемістити об'єкт
              <button onClick={() => setPlacingId(null)} className="underline underline-offset-2">
                Скасувати
              </button>
            </div>
          )}

          {/* Легенда */}
          <div className="absolute bottom-3 left-3 z-[500] rounded-lg bg-white/95 p-2.5 text-xs shadow">
            {Object.entries(CATEGORIES).map(([key, c]) => (
              <div key={key} className="flex items-center gap-2 py-0.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: c.color }} />
                {c.label}
              </div>
            ))}
          </div>
        </div>

        {/* ---------- БІЧНА ПАНЕЛЬ ---------- */}
        <aside className="w-full overflow-y-auto border-t border-stone-300 bg-white md:w-[380px] md:border-l md:border-t-0">
          {!selected ? (
            <QuarterOverview
              buildings={buildings}
              onSelect={setSelectedId}
              onReset={resetAll}
            />
          ) : (
            <BuildingPanel
              building={selected}
              activePhoto={activePhoto}
              setActivePhoto={setActivePhoto}
              onClose={() => setSelectedId(null)}
              onEdit={() => openEdit(selected)}
              onDelete={() => deleteBuilding(selected.id)}
              onMove={() => setPlacingId(selected.id)}
              onAddPhoto={addPhotoToSelected}
              onRemovePhoto={removePhoto}
            />
          )}
        </aside>
      </main>

      {/* ====================== МОДАЛКА ====================== */}
      {modalOpen && (
        <BuildingModal
          form={form}
          setForm={setForm}
          onSave={saveForm}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

/* ============================================================================
 *  7. БІЧНА ПАНЕЛЬ: ЗАГАЛЬНИЙ ВИГЛЯД
 * ============================================================================ */
function QuarterOverview({ buildings, onSelect, onReset }) {
  const count = (cat) => buildings.filter((b) => b.category === cat).length;
  return (
    <div className="p-5">
      <h2 className="text-lg font-bold">Про квартал</h2>
      <p className="mt-1 text-sm text-stone-600">
        Оберіть будинок на карті, щоб побачити фото, опис і характеристики.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {Object.entries(CATEGORIES).map(([key, c]) => (
          <div key={key} className="rounded-lg border border-stone-200 p-3">
            <c.Icon size={18} className="mx-auto" style={{ color: c.color }} />
            <div className="mt-1 text-xl font-bold">{count(key)}</div>
            <div className="text-xs text-stone-500">{c.label}</div>
          </div>
        ))}
      </div>

      <h3 className="mt-6 text-sm font-semibold text-stone-500">Усі об'єкти</h3>
      <ul className="mt-2 divide-y divide-stone-100">
        {buildings.map((b) => {
          const c = CATEGORIES[b.category];
          return (
            <li key={b.id}>
              <button
                onClick={() => onSelect(b.id)}
                className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-stone-50"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white"
                  style={{ background: c.color }}
                >
                  <c.Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{b.name}</span>
                  <span className="block truncate text-xs text-stone-500">{b.number}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        onClick={onReset}
        className="mt-6 flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800"
      >
        <RotateCcw size={13} /> Повернути початкові дані
      </button>
    </div>
  );
}

/* ============================================================================
 *  8. БІЧНА ПАНЕЛЬ: ІНФОРМАЦІЯ ПРО БУДИНОК
 * ============================================================================ */
function BuildingPanel({
  building: b,
  activePhoto,
  setActivePhoto,
  onClose,
  onEdit,
  onDelete,
  onMove,
  onAddPhoto,
  onRemovePhoto,
}) {
  const fileRef = useRef(null);
  const cat = CATEGORIES[b.category];
  const main = b.photos[activePhoto];

  return (
    <div>
      {/* Головне фото */}
      <div className="relative aspect-[4/3] bg-stone-200">
        {main ? (
          <img src={main} alt={b.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-stone-400">
            <ImagePlus size={32} />
            <span className="text-sm">Фото ще немає</span>
          </div>
        )}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 shadow hover:bg-white"
          aria-label="Закрити"
        >
          <X size={16} />
        </button>
      </div>

      {/* Галерея */}
      {b.photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 pt-3">
          {b.photos.map((p, i) => (
            <div key={i} className="group relative shrink-0">
              <button onClick={() => setActivePhoto(i)}>
                <img
                  src={p}
                  alt=""
                  className={`h-14 w-14 rounded-md object-cover ${
                    i === activePhoto ? "ring-2 ring-[#2f5d8a]" : "opacity-80 hover:opacity-100"
                  }`}
                />
              </button>
              <button
                onClick={() => onRemovePhoto(i)}
                className="absolute -right-1 -top-1 hidden rounded-full bg-red-600 p-0.5 text-white group-hover:block"
                aria-label="Видалити фото"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="p-5">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
            style={{ background: cat.color }}
          >
            <cat.Icon size={12} /> {cat.label}
          </span>
          {b.status && (
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
              {b.status}
            </span>
          )}
        </div>

        <h2 className="mt-2 text-xl font-bold leading-snug">{b.name}</h2>
        {b.number && <p className="text-sm text-stone-500">{b.number}</p>}

        {b.description && (
          <p className="mt-3 text-sm leading-relaxed text-stone-700">{b.description}</p>
        )}

        {b.features.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-semibold text-stone-500">Характеристики</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {b.features.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cat.color }} />
                  {f}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Дії */}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            onClick={onEdit}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-[#2f5d8a] px-3 py-2 text-sm font-semibold text-white hover:bg-[#264d73]"
          >
            <Pencil size={15} /> Редагувати
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold hover:bg-stone-50"
          >
            <ImagePlus size={15} /> Нове фото
          </button>
          <button
            onClick={onMove}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50"
          >
            <Move size={15} /> Перемістити на карті
          </button>
          <button
            onClick={onDelete}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 size={15} /> Видалити
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onAddPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/* ============================================================================
 *  9. МОДАЛЬНЕ ВІКНО: ДОДАТИ / РЕДАГУВАТИ ОБ'ЄКТ
 * ============================================================================ */
function BuildingModal({ form, setForm, onSave, onClose }) {
  const fileRef = useRef(null);
  const [url, setUrl] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const addUrl = () => {
    const u = url.trim();
    if (!u) return;
    setForm((f) => ({ ...f, photos: [...f.photos, u] }));
    setUrl("");
  };

  const addFiles = async (files) => {
    for (const file of Array.from(files || [])) {
      try {
        const data = await fileToDataUrl(file);
        setForm((f) => ({ ...f, photos: [...f.photos, data] }));
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const inputCls =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#2f5d8a] focus:ring-2 focus:ring-[#2f5d8a]/20";

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={onSave}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{form.id ? "Редагувати об'єкт" : "Новий об'єкт"}</h2>
          <button type="button" onClick={onClose} aria-label="Закрити" className="text-stone-400 hover:text-stone-800">
            <X size={20} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium">
            Назва *
            <input required value={form.name} onChange={set("name")} className={`${inputCls} mt-1`} placeholder="Наприклад, Будинок 12" />
          </label>

          <label className="block text-sm font-medium">
            Номер або адреса
            <input value={form.number} onChange={set("number")} className={`${inputCls} mt-1`} placeholder="вул. Дмитра Яворницького, 12" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Категорія
              <select value={form.category} onChange={set("category")} className={`${inputCls} mt-1`}>
                {Object.entries(CATEGORIES).map(([k, c]) => (
                  <option key={k} value={k}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Статус
              <input value={form.status} onChange={set("status")} className={`${inputCls} mt-1`} placeholder="Заселений" />
            </label>
          </div>

          <label className="block text-sm font-medium">
            Опис
            <textarea rows={3} value={form.description} onChange={set("description")} className={`${inputCls} mt-1`} />
          </label>

          <label className="block text-sm font-medium">
            Характеристики (кожна з нового рядка)
            <textarea
              rows={4}
              value={form.featuresText}
              onChange={set("featuresText")}
              className={`${inputCls} mt-1`}
              placeholder={"Поверхів: 9\nРік побудови: 1985"}
            />
          </label>

          {/* Фото */}
          <div>
            <div className="text-sm font-medium">Фото (перше — головне)</div>
            {form.photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {form.photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p} alt="" className="h-16 w-16 rounded-md object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }))}
                      className="absolute -right-1 -top-1 rounded-full bg-red-600 p-0.5 text-white"
                      aria-label="Видалити фото"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addUrl();
                  }
                }}
                placeholder="https://… посилання на фото"
                className={inputCls}
              />
              <button type="button" onClick={addUrl} className="flex shrink-0 items-center gap-1 rounded-lg border border-stone-300 px-3 text-sm hover:bg-stone-50">
                <LinkIcon size={14} /> Додати
              </button>
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#2f5d8a] hover:underline"
            >
              <ImagePlus size={15} /> Вибрати файли з комп'ютера
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {!form.id && (
            <p className="rounded-lg bg-stone-100 p-3 text-xs text-stone-600">
              Після збереження об'єкт з'явиться на карті. Клікніть потрібне місце, щоб розмістити його.
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50">
            Скасувати
          </button>
          <button type="submit" className="rounded-lg bg-[#2f5d8a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#264d73]">
            {form.id ? "Зберегти зміни" : "Додати на карту"}
          </button>
        </div>
      </form>
    </div>
  );
}
