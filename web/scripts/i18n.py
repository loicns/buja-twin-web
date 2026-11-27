"""The single source of the interface copy. Writes src/i18n/{fr,en}.json, so the two languages always have the same keys.

Run from web/:  python3 scripts/i18n.py        (edit the k(...) table below, never the JSON files)
French typography is applied for you: narrow no-break space before : ; ? ! and inside « », no-break space between a
number and its unit, narrow no-break space as thousands separator."""
import json, re, sys
from pathlib import Path

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "src/i18n"
K = {}
def k(key, fr, en): K[key] = (fr, en)

# --- chrome
k("brand", "Buja Flood Twin", "Buja Flood Twin")
k("doc_title", "Bujumbura – carte des inondations modélisées", "Bujumbura – modelled flood map")
k("skip", "Aller à la carte", "Skip to the map")
k("close", "Fermer", "Close")
k("lang_label", "Langue : passer en anglais", "Language: switch to French")
k("status_chip", "Modélisé · non calibré", "Modelled · uncalibrated")
k("status_chip_short", "Modélisé", "Modelled")
k("status_aria", "Modélisé, non calibré : lire les limites et les sources", "Modelled, uncalibrated: read the limits and sources")
k("limits", "Limites", "Limits")
k("limits_title", "Limites et sources", "Limits and sources")
k("share", "Partager", "Share")
k("share_title", "Copier le lien de cette vue", "Copy a link to this view")
k("share_copied", "Lien copié. Il ouvre la carte telle que vous la voyez.", "Link copied. It opens the map as you see it.")
k("share_failed", "Copie impossible : copiez l'adresse dans la barre du navigateur.", "Could not copy: use the address in the browser bar.")
k("ask_btn", "Poser une question", "Ask a question")
k("ask_short", "Question", "Ask")
k("home", "Toute la ville", "Whole city")
k("map_label", "Carte interactive de Bujumbura", "Interactive map of Bujumbura")
k("zoom_in", "Zoom avant", "Zoom in")
k("zoom_out", "Zoom arrière", "Zoom out")
k("reset_north", "Orienter le nord vers le haut", "Reset bearing to north")

# --- intro cover
k("intro_eyebrow", "Démonstration de recherche · Bujumbura", "Research demo · Bujumbura")
k("intro_title", "Où l'eau pourrait monter lors d'un orage à Bujumbura", "Where water could rise in a Bujumbura storm")
k("intro_lede", "Trois orages simulés, du fréquent à l'extrême : hauteur d'eau, bâtiments et personnes concernés, quartier par quartier.",
  "Three simulated storms, from frequent to extreme: water depth, and the buildings and people affected, neighbourhood by neighbourhood.")
k("intro_numbers", "Orage sévère · 1 chance sur 100 par an", "Severe storm · 1 in 100 chance each year")
k("intro_people", "personnes dans des bâtiments à plus de 0,5 m d'eau", "people in buildings with over 0.5 m of water")
k("intro_buildings", "bâtiments à plus de 0,5 m d'eau", "buildings with over 0.5 m of water")
k("intro_land", "de terres sous plus de 0,5 m d'eau", "of land under more than 0.5 m of water")
k("intro_honest", "Ce sont des résultats de modèle, pas des observations. Le modèle n'est pas calibré et inonde probablement trop : environ 40 % de surface de plus que Copernicus.",
  "These are model results, not observations. The model is uncalibrated and probably floods too much: about 40% more area than Copernicus.")
k("intro_warn", "Ceci n'est pas une alerte. Pour les alertes officielles : IGEBU et Protection civile du Burundi.",
  "This is not a warning. For official alerts: IGEBU and Burundi's civil protection.")
k("intro_go", "Explorer la carte", "Explore the map")
k("intro_how", "Comment c'est fait", "How it was made")
k("intro_method", "SFINCS 20 m · Google Open Buildings · WorldPop 2020 · comparé à Copernicus EMSN191",
  "SFINCS 20 m · Google Open Buildings · WorldPop 2020 · compared with Copernicus EMSN191")
k("intro_reopen", "Présentation de la carte", "About this map")

# --- panel
k("search_label", "Chercher un quartier", "Find a neighbourhood")
k("search_placeholder", "Buterere, Kinama, Rohero…", "Buterere, Kinama, Rohero…")
k("search_none", "Aucun quartier de ce nom. Les quartiers sont approximatifs (77 lieux OpenStreetMap).", "No neighbourhood by that name. Neighbourhoods are approximate (77 OpenStreetMap places).")
k("search_count", "{n} résultats", "{n} results")
k("sec_scenario", "Scénario d'orage", "Storm scenario")
k("scenarios_aria", "Choix du scénario", "Scenario choice")
k("sc_s1", "Orage fréquent", "Frequent storm")
k("sc_s1_note", "≈ 1 chance sur 10 par an", "≈ 1 in 10 chance each year")
k("sc_s2", "Orage sévère", "Severe storm")
k("sc_s2_note", "1 chance sur 100 par an", "1 in 100 chance each year")
k("sc_s3", "Orage extrême", "Extreme storm")
k("sc_s3_note", "cas de référence Copernicus", "Copernicus benchmark case")
k("sc_detail", "{rain} mm en {h} h · lac à {lake} m", "{rain} mm in {h} h · lake at {lake} m")
k("stat_people", "Personnes dans des bâtiments à plus de 0,5 m d'eau", "People in buildings with over 0.5 m of water")
k("stat_buildings", "Bâtiments à plus de 0,5 m d'eau", "Buildings with over 0.5 m of water")
k("stat_wet", "Terres sous plus de 0,5 m d'eau", "Land under more than 0.5 m of water")
k("approx", "≈", "≈")
k("km2", "km²", "km²")
k("sec_depth", "Hauteur d'eau maximale", "Highest water depth")
k("depth_b1", "chevilles à genoux", "ankle to knee")
k("depth_b2", "genoux à poitrine", "knee to chest")
k("depth_b3", "plus haut qu'une personne", "over a person's head")
k("depth_b4", "rez-de-chaussée sous l'eau", "ground floor under water")
k("depth_b5", "plus d'un étage", "more than one storey")
k("depth_dry", "sec ou presque", "dry or nearly")
k("depth_note", "Les bâtiments prennent la couleur de l'eau la plus haute sous leur emprise. Gris clair : moins de 0,1 m. Une zone grise peut quand même être inondée.",
  "Buildings take the colour of the highest water under their footprint. Light grey: under 0.1 m. A grey area can still flood.")
k("range_to", "{a}–{b} m", "{a}–{b} m")
k("range_over", "plus de {a} m", "over {a} m")
k("sec_top", "Quartiers les plus touchés", "Most affected neighbourhoods")
k("top_note", "Personnes à plus de 0,5 m d'eau. Choisissez un quartier pour le voir sur la carte.", "People in over 0.5 m of water. Pick a neighbourhood to see it on the map.")
k("top_go", "Voir {name} sur la carte", "Show {name} on the map")
k("sec_layers", "Couches", "Layers")
k("sec_view", "Vue", "View")
k("sec_about", "À propos et sources", "About and sources")
k("grp_hazard", "Aléa modélisé", "Modelled hazard")
k("grp_exposure", "Exposition", "Exposure")
k("grp_vegetation", "Végétation", "Vegetation")
k("grp_context", "Repères", "Landmarks")
k("st_observed", "Observé", "Observed")
k("st_modelled", "Modélisé", "Modelled")
k("st_assumed", "Supposé", "Assumed")
k("layer_flood", "Hauteur d'eau", "Water depth")
k("layer_flood_src", "SFINCS 20 m · non calibré", "SFINCS 20 m · uncalibrated")
k("layer_buildings", "Bâtiments", "Buildings")
k("layer_buildings_src", "Google Open Buildings · OpenStreetMap · hauteurs estimées", "Google Open Buildings · OpenStreetMap · estimated heights")
k("layer_priority", "Zones à examiner en premier", "Areas to look at first")
k("layer_priority_src", "Hexagones H3 · WorldPop 2020 · répartition par surface", "H3 hexagons · WorldPop 2020 · floor-area allocation")
k("layer_zones", "Quartiers approximatifs", "Approximate neighbourhoods")
k("layer_zones_src", "Cellules autour de 77 lieux OpenStreetMap", "Cells around 77 OpenStreetMap places")
k("layer_canopy", "Canopée", "Tree canopy")
k("layer_canopy_src", "Meta et WRI · hauteur maximale par cellule de 5 m", "Meta and WRI · maximum height per 5 m cell")
k("layer_trees", "Arbres détectés", "Detected trees")
k("layer_trees_src", "Détection sur hauteur de canopée 1 m", "Detected on 1 m canopy height")
k("layer_rivers", "Cours d'eau", "Rivers")
k("layer_rivers_src", "Drainage du MNT hydro-forcé · OpenStreetMap", "Hydro-enforced DEM drainage · OpenStreetMap")
k("layer_bridges", "Ponts", "Bridges")
k("layer_bridges_src", "OpenStreetMap", "OpenStreetMap")
k("layer_terrain", "Relief (ombrage)", "Terrain (hillshade)")
k("layer_terrain_src", "FABDEM", "FABDEM")
k("layer_on", "Afficher la couche {name}", "Show the {name} layer")
k("opacity", "Opacité", "Opacity")
k("opacity_aria", "Opacité de {name}", "Opacity of {name}")
k("from_zoom", "visible à partir du zoom {z}", "visible from zoom {z}")
k("zoom_to_see", "Zoomer pour voir", "Zoom in to see")
k("hint_buildings", "Zoomez pour voir les bâtiments", "Zoom in to see the buildings")
k("hint_buildings_3d", "Zoomez pour voir les bâtiments en 3D", "Zoom in to see the buildings in 3D")
k("view_3d", "3D", "3D")
k("view_2d", "2D", "2D")
k("view_note_3d", "Relief et bâtiments en volume. Incliner : Ctrl + glisser, ou deux doigts sur un écran tactile.", "Terrain and buildings in relief. To tilt: Ctrl + drag, or two fingers on a touch screen.")
k("view_note_2d", "Vue de dessus. Plus légère pour les téléphones et les connexions lentes.", "Top-down view. Lighter for phones and slow connections.")
k("lg_canopy", "Hauteur de canopée", "Canopy height")
k("lg_canopy_note", "Estimée sur images satellite 2016–2020. Non utilisée par le modèle d'inondation.", "Estimated from 2016–2020 satellite images. Not used by the flood model.")
k("lg_trees", "Cercle = couronne, teinte = hauteur. Estimé, non relevé.", "Circle = crown, tint = height. Estimated, not surveyed.")
k("lg_priority_note", "Hexagones où des personnes sont à plus de 0,5 m d'eau (orage sévère). Un indice de tri, pas un ordre d'agir.", "Hexagons where people are in over 0.5 m of water (severe storm). A screening rank, not an order to act.")
k("lg_low", "plus bas", "lower")
k("lg_high", "plus haut", "higher")
k("lg_zones", "Cellules autour de 77 points, pas des limites officielles.", "Cells around 77 points, not official boundaries.")
k("range_canopy", "{a}–{b} m", "{a}–{b} m")
k("canopy_over", "plus de {a} m", "over {a} m")
k("veg_why_title", "Pourquoi la végétation ?", "Why vegetation?")
k("veg_why", "Sur les collines au-dessus de la ville, les pentes nues ou bâties font ruisseler la pluie et creusent des ravines. Cette carte montre la canopée actuelle, à titre descriptif : elle ne montre pas que planter des arbres réduirait ces hauteurs d'eau.",
  "On the hills above the city, bare or built-up slopes speed up runoff and open gullies. This map shows today's canopy, for description only: it does not show that planting trees would lower these water depths.")
k("about_feedback_hint", "Vous testez cette carte : dites-nous ce qui manque ou ce qui est faux.", "You are testing this map: tell us what is missing or wrong.")
k("d_code", "Code source", "Source code")
k("feedback", "Donner un avis", "Give feedback")
k("version_label", "Données {v}", "Data {v}")
k("sec_preview", "Aperçu du modèle de substitution", "Surrogate-model preview")

# --- collar, loading, announcements
k("collar_caption", "{scenario} · hauteur d'eau modélisée, non calibrée", "{scenario} · modelled water depth, uncalibrated")
k("collar_hint", "Survolez la carte pour lire coordonnées et altitude", "Hover the map to read coordinates and elevation")
k("collar_cursor", "Curseur", "Cursor")
k("collar_sources", "Sources", "Sources")
k("readout_south", "S", "S"); k("readout_east", "E", "E"); k("readout_north", "N", "N"); k("readout_west", "O", "W")
k("loading_data", "Chargement des données…", "Loading data…")
k("loading_map", "Chargement des tuiles d'inondation…", "Loading flood tiles…")
k("error", "Impossible de charger les données.", "Could not load the data.")
k("retry", "Réessayer", "Try again")
k("no3d", "Connexion lente ou appareil modeste : la carte démarre en 2D.", "Slow connection or modest device: the map starts in 2D.")
k("summary", "Carte de Bujumbura, scénario {scenario} ({detail}). Terres sous plus de 0,5 m d'eau : {km} km². Environ {b} bâtiments et {p} personnes à plus de 0,5 m d'eau. Quartiers les plus touchés : {top}. Modélisé et non calibré.",
  "Map of Bujumbura, scenario {scenario} ({detail}). Land under more than 0.5 m of water: {km} km². About {b} buildings and {p} people in more than 0.5 m of water. Most affected neighbourhoods: {top}. Modelled and uncalibrated.")
k("announce_scenario", "{name} : environ {p} personnes à plus de 0,5 m d'eau.", "{name}: about {p} people in over 0.5 m of water.")
k("announce_zone", "{name} affiché sur la carte.", "{name} shown on the map.")

# --- popups
k("bld_title", "Bâtiment", "Building")
k("bld_height", "Hauteur", "Height")
k("bld_area", "Emprise", "Footprint")
k("bld_depth", "Eau la plus haute sous l'emprise", "Highest water under the footprint")
k("bld_note", "Modélisé (SFINCS 20 m), non calibré. Pas une prévision pour ce bâtiment.", "Modelled (SFINCS 20 m), uncalibrated. Not a forecast for this building.")
k("hex_title", "Zone près de {near}", "Area near {near}")
k("hex_buildings", "Bâtiments", "Buildings")
k("hex_people", "Habitants (estimation)", "Residents (estimate)")
k("hex_flooded", "À plus de 0,5 m : bâtiments / personnes", "Over 0.5 m: buildings / people")
k("hex_rank", "Rang, orage sévère : {rank}", "Rank, severe storm: {rank}")
k("hex_note", "Indice de tri : personnes touchées et fréquence. Il indique où regarder en premier, pas où agir.", "A screening rank: people affected and how often. It says where to look first, not where to act.")
k("zone_title", "{name}", "{name}")
k("zone_kicker", "Quartier approximatif", "Approximate neighbourhood")
k("zone_people", "Habitants (estimation)", "Residents (estimate)")
k("zone_canopy", "Canopée de 2 m ou plus", "Canopy 2 m or taller")
k("zone_trees", "Arbres détectés", "Detected trees")
k("zone_trees_v", "{v} par hectare", "{v} per hectare")
k("zone_veg_note", "Végétation : description seulement, non utilisée par le modèle d'inondation.", "Vegetation: description only, not used by the flood model.")
k("zone_rough", "Moins fiable ici : {pct} % de ce quartier est dans le carré test de rugosité du modèle (voir Limites).", "Less reliable here: {pct}% of this neighbourhood lies in the model's roughness test square (see Limits).")
k("bridge_title", "Pont", "Bridge")
k("bridge_river", "Cours d'eau", "Watercourse")
k("bridge_road", "Route", "Road")
k("bridge_note", "Position OpenStreetMap.", "OpenStreetMap position.")

# --- live preview
k("live_intro", "Un modèle d'apprentissage automatique reproduit SFINCS en une seconde. C'est un outil de recherche, pas une prévision, et il est moins fiable hors de sa plage d'entraînement.", "A machine-learning model reproduces SFINCS in about a second. It is a research tool, not a forecast, and it is less reliable outside its training range.")
k("live_rain", "Pluie : {v} mm", "Rain: {v} mm")
k("live_lake", "Lac : {v} m", "Lake: {v} m")
k("live_show", "Afficher l'aperçu", "Show the preview")
k("live_wake", "Réveil du modèle, environ 10 s…", "Waking the model, about 10 s…")
k("live_busy", "Calcul…", "Computing…")
k("live_error", "Aperçu indisponible pour le moment.", "Preview is unavailable right now.")
k("live_result", "Modèle de substitution, pas SFINCS : {km} km² à plus de 0,5 m, profondeur maximale {max} m.", "Surrogate model, not SFINCS: {km} km² deeper than 0.5 m, maximum depth {max} m.")
k("live_warn", "Hors de la plage d'entraînement (pluie 33 à 166 mm, lac 769,9 à 773,0 m) : extrapolation, peu fiable.", "Outside the training range (rain 33 to 166 mm, lake 769.9 to 773.0 m): extrapolation, not reliable.")

# --- limits dialog
k("d_caveat_title", "Avant d'utiliser un chiffre", "Before you use a number")
k("d_caveat", "Cette carte est une démonstration de recherche non commerciale. Les profondeurs sont modélisées, pas observées, et le modèle n'est calibré sur aucune inondation réelle. Il inonde trop. Pour les alertes officielles, voir l'IGEBU et la Protection civile du Burundi. N'utilisez pas ces chiffres pour décider d'une évacuation.",
  "This map is a non-commercial research demo. Depths are modelled, not observed, and the model is not calibrated on any real flood. It floods too much. For official alerts, see IGEBU and Burundi's civil protection. Do not use these numbers to decide on an evacuation.")
k("d_states_title", "Observé, modélisé, supposé", "Observed, modelled, assumed")
k("d_states", "Observé : relevé ou cartographié par d'autres (OpenStreetMap). Modélisé : calculé par un modèle (SFINCS, hauteur de canopée estimée par apprentissage, relief corrigé par modèle). Supposé : résulte d'une règle de ma part (répartition de la population, quartiers, indice de priorité).",
  "Observed: surveyed or mapped by others (OpenStreetMap). Modelled: computed by a model (SFINCS, canopy height estimated by machine learning, model-corrected terrain). Assumed: the result of a rule I applied (population allocation, neighbourhoods, priority rank).")
k("d_what_title", "Ce que montre la carte", "What the map shows")
k("d_what", "Trois orages simulés avec SFINCS à 20 m : profondeur maximale de l'eau, bâtiments touchés et personnes concernées (estimation). Niveau du lac : 772,50 m (scénarios 1 et 2) et 772,95 m (scénario 3). « 1 chance sur 100 par an » veut dire qu'un tel orage peut arriver n'importe quelle année, et même deux années de suite.",
  "Three storms simulated with SFINCS at 20 m: maximum water depth, affected buildings and an estimate of the people involved. Lake level: 772.50 m (scenarios 1 and 2) and 772.95 m (scenario 3). “1 in 100 chance each year” means such a storm can come in any year, even two years running.")
k("d_evidence_title", "Ce que l'on sait de la qualité", "What we know about quality")
k("d_ev_cop", "Contre le modèle Copernicus EMSN191 (scénario 4, mêmes conditions que le scénario 3) : CSI {csi}, détection {hit}, fausses alarmes {far}. Il trouve presque tout ce que Copernicus inonde, mais inonde environ 40 % de surface en plus ({model} km² contre {ref} km²).",
  "Against the Copernicus EMSN191 model (scenario 4, the same conditions as scenario 3): CSI {csi}, hit rate {hit}, false-alarm ratio {far}. It finds almost everything Copernicus floods, but floods about 40% more area ({model} km² against {ref} km²).")
k("d_ev_gfm", "Contre Sentinel-1 en 2024 : le satellite n'a vu que {obs} km² d'inondation contre {model} km² simulés. 2024 était surtout une montée du lac : ce test ne mesure pas la qualité pour un orage.",
  "Against Sentinel-1 in 2024: the satellite saw only {obs} km² of flooding against {model} km² modelled. 2024 was mostly a lake rise, so this test does not measure storm-flood quality.")
k("d_ev_sur", "Le modèle de substitution reproduit SFINCS avec un CSI de {s0} à {s1} sur des orages inconnus et de {c0} à {c1} sur un bassin inconnu.",
  "The surrogate model reproduces SFINCS with a CSI of {s0} to {s1} on unseen storms and {c0} to {c1} on an unseen catchment.")
k("d_ev_rough", "Défaut connu : la rugosité lue par le modèle contient un carré test de 4 × 4 km de « forêt » fictive, au nord du centre (Mutakura, Ntahangwa, Ngagara, et environ la moitié de Buterere et du Quartier industriel). La vraie canopée n'est pas dans le modèle. Les hauteurs d'eau y sont moins fiables, et ces quartiers sont parmi les plus touchés. Les simulations doivent être refaites.",
  "Known defect: the roughness the model reads holds a 4 × 4 km synthetic “forest” test square north of the centre (Mutakura, Ntahangwa, Ngagara, and about half of Buterere and Quartier Industriel). The real canopy is not in the model. Water depths there are less reliable, and these neighbourhoods are among the most affected. The simulations need to be rerun.")
k("d_s1_note", "Le scénario 1 date d'avant une correction du modèle (nombres de courbe) ; l'effet mesuré sur les autres scénarios est inférieur à 1 %.",
  "Scenario 1 predates a model fix (curve numbers); the measured effect on the other scenarios is under 1%.")
k("d_datum_title", "Niveau du lac", "Lake level")
k("d_datum", "Le niveau du lac est de 772,50 m (EGM2008, pic de 2024). Un chiffre de presse d'environ 777 m est une lecture locale d'échelle : ne pas mélanger les deux.",
  "The lake level is 772.50 m (EGM2008, the 2024 peak). A press figure of about 777 m is a local gauge reading: do not mix the two.")
k("d_lake_title", "Lac exclu", "Lake excluded")
k("d_lake", "Le lac Tanganyika est exclu des surfaces et des couleurs : le modèle y indique environ 2,5 m d'eau, ce qui est de l'eau libre et non une inondation.",
  "Lake Tanganyika is excluded from areas and colours: the model shows about 2.5 m of water there, which is open water, not flooding.")
k("d_people_title", "Personnes et quartiers", "People and neighbourhoods")
k("d_people", "Les personnes viennent de WorldPop 2020, réparties entre les bâtiments selon leur surface de plancher. L'estimation peut être fausse dans les quartiers informels. Les nombres sont arrondis et montrés par zone, jamais par bâtiment. Les quartiers sont des cellules autour de 77 points, pas des limites officielles.",
  "People come from WorldPop 2020, shared among buildings by floor area. The estimate can be wrong in informal areas. Counts are rounded and shown per area, never per building. Neighbourhoods are cells around 77 points, not official boundaries.")
k("d_veg_title", "Végétation", "Vegetation")
k("d_veg", "La canopée vient de la carte de hauteur de canopée de Meta et WRI (estimation à partir d'images satellite de 2016 à 2020, 1 m), recalée de 6 m vers le nord et de 4 m vers l'est d'après les emprises de bâtiments, puis agrégée à 5 m. Les arbres sont les {n} couronnes détectées sur cette carte ; c'est un minimum sous un couvert fermé. Aucune espèce n'est indiquée. La part de canopée par quartier est descriptive.",
  "Canopy comes from the Meta and WRI canopy height map (estimated from 2016–2020 satellite images, 1 m), shifted 6 m north and 4 m east to match building footprints, then aggregated to 5 m. Trees are the {n} crowns detected on that map, a lower bound under closed canopy. No species are given. The canopy share per neighbourhood is descriptive.")
k("d_vegflood_title", "Végétation et inondations", "Vegetation and flooding")
k("d_vegflood", "Sur les collines escarpées au-dessus de Bujumbura, les pentes nues ou bâties font ruisseler la pluie et ouvrent des ravines : les chercheurs ont recensé plus de 1 200 glissements de terrain et 81 ravines autour de la ville. Les arbres et le couvert végétal freinent le ruissellement et retiennent le sol, surtout lors des pluies faibles à modérées. Cette carte ne montre pas que planter des arbres réduirait ces hauteurs d'eau : le modèle n'a pas été lancé avec une autre végétation, et l'essentiel des inondations modélisées vient de rivières qui drainent environ 1 000 km² de collines hors de la carte de canopée.",
  "On the steep hills above Bujumbura, bare and built-up slopes speed up runoff and open gullies: researchers have mapped over 1,200 landslides and 81 gullies around the city. Trees and ground cover slow runoff and hold soil, mostly in small and moderate storms. This map does not show that planting trees would lower these depths: the model has not been run with different vegetation, and most modelled flooding comes from rivers draining about 1,000 km² of hills outside the canopy map.")
k("d_keys_title", "Clavier", "Keyboard")
k("d_keys", "Sur la carte : flèches pour se déplacer, + et − pour zoomer. Touches 1, 2 et 3 : changer de scénario (quand le focus est sur la carte ou le panneau).",
  "On the map: arrow keys to pan, + and − to zoom. Keys 1, 2 and 3: change scenario (when focus is on the map or the panel).")
k("d_lic_title", "Données et licences", "Data and licences")
k("d_lic_basemap", "Fond de carte : © contributeurs OpenStreetMap (ODbL), OpenMapTiles (CC BY 4.0), OpenFreeMap.", "Basemap: © OpenStreetMap contributors (ODbL), OpenMapTiles (CC BY 4.0), OpenFreeMap.")
k("d_lic_terrain", "Relief : FABDEM, Université de Bristol / Fathom, CC BY-NC-SA 4.0. Il limite cette démonstration à un usage non commercial.", "Terrain: FABDEM, University of Bristol / Fathom, CC BY-NC-SA 4.0. It limits this demo to non-commercial use.")
k("d_lic_buildings", "Bâtiments : Google Open Buildings (CC BY 4.0) et © contributeurs OpenStreetMap (ODbL).", "Buildings: Google Open Buildings (CC BY 4.0) and © OpenStreetMap contributors (ODbL).")
k("d_lic_veg", "Canopée et arbres : Meta et WRI, High Resolution Canopy Height (CC BY 4.0).", "Canopy and trees: Meta and WRI, High Resolution Canopy Height (CC BY 4.0).")
k("d_lic_pop", "Population : WorldPop, Université de Southampton (CC BY 4.0), agrégée uniquement.", "Population: WorldPop, University of Southampton (CC BY 4.0), aggregated only.")
k("d_lic_flood", "Inondations modélisées : Bujumbura Flood Twin (CC BY 4.0).", "Modelled floods: Bujumbura Flood Twin (CC BY 4.0).")
k("d_lic_rivers", "Cours d'eau : drainage du MNT hydro-forcé, d'après HydroRIVERS (Lehner et Grill, 2013) et OpenStreetMap.", "Rivers: hydro-enforced DEM drainage, after HydroRIVERS (Lehner and Grill, 2013) and OpenStreetMap.")
k("d_version", "Version des données : {v}", "Data version: {v}")

# --- assistant
k("chat_title", "Poser une question sur la carte", "Ask about the map")
k("chat_close", "Fermer l'assistant", "Close the assistant")
k("chat_placeholder", "Posez une question sur cette carte…", "Ask a question about this map…")
k("chat_send", "Envoyer", "Send")
k("chat_clear", "Effacer", "Clear")
k("chat_thinking", "Réflexion…", "Thinking…")
k("chat_note", "Un assistant IA répond à partir des données de cette carte. Il peut se tromper. Ce n'est ni une prévision ni un avertissement officiel.", "An AI assistant answers from this map's data. It can be wrong. It is not a forecast or an official warning.")
k("chat_hello", "Je peux expliquer les scénarios, les quartiers les plus touchés, les couches et leurs limites. Je ne fais pas de prévision.", "I can explain the scenarios, the most affected neighbourhoods, the layers and their limits. I do not make forecasts.")
k("chat_s1", "Quels quartiers sont les plus touchés dans l'orage sévère ?", "Which neighbourhoods are most affected in the severe storm?")
k("chat_s2", "Que veut dire « modélisé, non calibré » ?", "What does “modelled, uncalibrated” mean?")
k("chat_s3", "Va-t-il inonder demain ?", "Will it flood tomorrow?")
k("chat_s4", "Comment sont comptées les personnes ?", "How are people counted?")
k("chat_error", "L'assistant est indisponible pour le moment.", "The assistant is unavailable right now.")
k("chat_not_configured", "L'assistant n'est pas encore activé sur ce site.", "The assistant is not switched on for this site yet.")
k("chat_busy", "L'assistant est très sollicité. Réessayez dans une minute.", "The assistant is busy. Try again in a minute.")
k("chat_too_long", "Question trop longue.", "Question too long.")
k("chat_you", "Vous", "You")
k("chat_ai", "Assistant IA", "AI assistant")

# --- mobile sheet
k("sheet_open", "Afficher les détails", "Show details")
k("sheet_close", "Réduire", "Collapse")

NNBSP, NBSP = " ", " "
def fr_typo(s: str) -> str:
    s = re.sub(r" ([:;?!])", NNBSP + r"\1", s)
    s = s.replace("« ", "«" + NNBSP).replace(" »", NNBSP + "»")
    s = re.sub(r"(\d|\})\s(m|mm|h|km²|m²|%)(?=[\s.,;:)·]|$)", r"\1" + NBSP + r"\2", s)
    s = re.sub(r"(\d) (\d{3})", r"\1" + NNBSP + r"\2", s)  # 1 200 -> thin space thousands
    s = s.replace("≈ ", "≈" + NBSP)
    return s
def en_typo(s: str) -> str:
    s = re.sub(r"(\d|\})\s(m|mm|h|km²|m²)(?=[\s.,;:)·]|$)", r"\1" + NBSP + r"\2", s)
    return s.replace("≈ ", "≈" + NBSP)

fr = {key: fr_typo(v[0]) for key, v in K.items()}
en = {key: en_typo(v[1]) for key, v in K.items()}
for name, d in (("fr", fr), ("en", en)):
    (OUT / f"{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print(len(K), "keys")
