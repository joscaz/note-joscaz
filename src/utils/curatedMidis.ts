export interface CuratedMidi {
  id: string;
  title: string;
  composer: string;
  difficulty: 'Intermediate' | 'Advanced' | 'Master';
  filename: string;
  attribution: string;
  genre: 'Classical' | 'Pop/Modern' | 'Game/Anime' | 'Special';
  downloadable: boolean;
}

export const curatedMidis: CuratedMidi[] = [
  {
    id: "debussy-arabesque-no-1",
    title: "Arabesque No. 1",
    composer: "Claude Debussy",
    difficulty: "Advanced",
    filename: "rousseau_debussy_arabesque_no_1_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "debussy-clair-de-lune",
    title: "Clair De Lune",
    composer: "Claude Debussy",
    difficulty: "Intermediate",
    filename: "rousseau_debussy_clair_de_lune_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "debussy-reflets-dans-leau-images",
    title: "Reflets dans l'eau (Images)",
    composer: "Claude Debussy",
    difficulty: "Intermediate",
    filename: "rousseau_debussy_reflets_dans_leau_images_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "satie-gymnopedie-no-1",
    title: "Gymnopédie No. 1",
    composer: "Erik Satie",
    difficulty: "Intermediate",
    filename: "rousseau_satie_gymnopedie_no_1_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "liszt-consolation-no-3",
    title: "Consolation No. 3",
    composer: "Franz Liszt",
    difficulty: "Advanced",
    filename: "rousseau_liszt_consolation_no_3_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "liszt-hungarian-rhapsody-no-6",
    title: "Hungarian Rhapsody No. 6",
    composer: "Franz Liszt",
    difficulty: "Master",
    filename: "rousseau_liszt_hungarian_rhapsody_no_6_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "liszt-hungarian-rhapsody-no-2",
    title: "Hungarian Rhapsody No. 2",
    composer: "Franz Liszt",
    difficulty: "Master",
    filename: "rousseau_liszt_hungarian_rhapsody_no_2_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "paganini-liszt-la-campanella",
    title: "La Campanella",
    composer: "Franz Liszt",
    difficulty: "Master",
    filename: "rousseau_paganini_liszt_la_campanella_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "liszt-liebestraum-no-3",
    title: "Liebestraum No. 3",
    composer: "Franz Liszt",
    difficulty: "Advanced",
    filename: "rousseau_liszt_liebestraum_no_3_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "liszt-un-sospiro",
    title: "Un Sospiro",
    composer: "Franz Liszt",
    difficulty: "Advanced",
    filename: "rousseau_liszt_un_sospiro_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "schubert-serenade-arr-liszt",
    title: "Serenade (arr. Liszt)",
    composer: "Franz Schubert",
    difficulty: "Intermediate",
    filename: "rousseau_schubert_serenade_arr_liszt_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-ballade-no-1-in-g-minor-op-23",
    title: "Ballade No. 1 in G Minor Op. 23",
    composer: "Frédéric Chopin",
    difficulty: "Advanced",
    filename: "rousseau_chopin_ballade_no_1_in_g_minor_op_23_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-etude-op-10-no-1-waterfall",
    title: "Etude Op. 10 No. 1 (Waterfall)",
    composer: "Frédéric Chopin",
    difficulty: "Master",
    filename: "rousseau_chopin_etude_op_10_no_1_waterfall_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-etude-op-10-no-3",
    title: "Etude Op. 10 No. 3",
    composer: "Frédéric Chopin",
    difficulty: "Intermediate",
    filename: "rousseau_chopin_etude_op_10_no_3_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-etude-op-10-no-4",
    title: "Etude Op. 10 No. 4",
    composer: "Frédéric Chopin",
    difficulty: "Master",
    filename: "rousseau_chopin_etude_op_10_no_4_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-etude-op-10-no-5-black-keys",
    title: "Etude Op. 10 No. 5 (Black Keys)",
    composer: "Frédéric Chopin",
    difficulty: "Intermediate",
    filename: "rousseau_chopin_etude_op_10_no_5_black_keys_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-etude-op-25-no-11-winter-wind",
    title: "Etude Op. 25 No. 11 (Winter Wind)",
    composer: "Frédéric Chopin",
    difficulty: "Master",
    filename: "rousseau_chopin_etude_op_25_no_11_winter_wind_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-etude-op-25-no-12-ocean",
    title: "Etude Op. 25 No. 12 (Ocean)",
    composer: "Frédéric Chopin",
    difficulty: "Master",
    filename: "rousseau_chopin_etude_op_25_no_12_ocean_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-fantaisie-impromptu-op-66",
    title: "Fantaisie Impromptu Op. 66",
    composer: "Frédéric Chopin",
    difficulty: "Advanced",
    filename: "rousseau_chopin_fantaisie_impromptu_op_66_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-marche-funebre",
    title: "Marche Funebre",
    composer: "Frédéric Chopin",
    difficulty: "Intermediate",
    filename: "rousseau_chopin_marche_funebre_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-minute-waltz-op-64-no-1",
    title: "Minute Waltz (Op. 64 No. 1)",
    composer: "Frédéric Chopin",
    difficulty: "Intermediate",
    filename: "rousseau_chopin_minute_waltz_op_64_no_1_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-nocturne-no-20-in-c-minor",
    title: "Nocturne No. 20 in C# Minor",
    composer: "Frédéric Chopin",
    difficulty: "Intermediate",
    filename: "rousseau_chopin_nocturne_no_20_in_c_minor_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-nocturne-in-e-flat-major-op-9-no-2",
    title: "Nocturne in E Flat Major Op. 9 No. 2",
    composer: "Frédéric Chopin",
    difficulty: "Intermediate",
    filename: "rousseau_chopin_nocturne_in_e_flat_major_op_9_no_2_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-prelude-op-28-no-6",
    title: "Prelude Op. 28 No. 6",
    composer: "Frédéric Chopin",
    difficulty: "Intermediate",
    filename: "rousseau_chopin_prelude_op_28_no_6_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-prelude-in-e-minor-op-28-no-4",
    title: "Prelude in E Minor Op. 28 No. 4",
    composer: "Frédéric Chopin",
    difficulty: "Intermediate",
    filename: "rousseau_chopin_prelude_in_e_minor_op_28_no_4_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-revolutionary-etude-op-10-no-12",
    title: "Revolutionary Etude (Op. 10 No. 12)",
    composer: "Frédéric Chopin",
    difficulty: "Intermediate",
    filename: "rousseau_chopin_revolutionary_etude_op_10_no_12_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "js-bach-prelude-in-c",
    title: "Prelude in C",
    composer: "Johann Sebastian Bach",
    difficulty: "Intermediate",
    filename: "rousseau_js_bach_prelude_in_c_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "beethoven-fur-elise",
    title: "Für Elise",
    composer: "Ludwig van Beethoven",
    difficulty: "Intermediate",
    filename: "rousseau_beethoven_fur_elise_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "beethoven-moonlight-sonata-mvt-1",
    title: "Moonlight Sonata Mvt. 1",
    composer: "Ludwig van Beethoven",
    difficulty: "Advanced",
    filename: "rousseau_beethoven_moonlight_sonata_mvt_1_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "beethoven-moonlight-sonata-mvt-2",
    title: "Moonlight Sonata Mvt. 2",
    composer: "Ludwig van Beethoven",
    difficulty: "Advanced",
    filename: "rousseau_beethoven_moonlight_sonata_mvt_2_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "beethoven-moonlight-sonata-mvt-3",
    title: "Moonlight Sonata Mvt. 3",
    composer: "Ludwig van Beethoven",
    difficulty: "Advanced",
    filename: "rousseau_beethoven_moonlight_sonata_mvt_3_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "rimsky-korsakov-flight-of-the-bumblebee-arr-rachmaninoff",
    title: "Flight of the Bumblebee (arr. Rachmaninoff)",
    composer: "Nikolai Rimsky-Korsakov",
    difficulty: "Advanced",
    filename: "rousseau_rimsky_korsakov_flight_of_the_bumblebee_arr_rachmaninoff_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "rachmaninoff-little-red-riding-hood-op-39-no-6",
    title: "Little Red Riding Hood (Op. 39 No. 6)",
    composer: "Sergei Rachmaninoff",
    difficulty: "Intermediate",
    filename: "rousseau_rachmaninoff_little_red_riding_hood_op_39_no_6_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "rachmaninoff-prelude-in-c-sharp-minor-op-3-no-2",
    title: "Prelude in C Sharp Minor Op. 3 No. 2",
    composer: "Sergei Rachmaninoff",
    difficulty: "Intermediate",
    filename: "rousseau_rachmaninoff_prelude_in_c_sharp_minor_op_3_no_2_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "rachmaninoff-prelude-in-g-minor-op-23-no-5",
    title: "Prelude in G Minor Op. 23 No. 5",
    composer: "Sergei Rachmaninoff",
    difficulty: "Intermediate",
    filename: "rousseau_rachmaninoff_prelude_in_g_minor_op_23_no_5_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "chopin-heroic-polonaise-op53",
    title: "Heroic Polonaise Op. 53",
    composer: "Frédéric Chopin",
    difficulty: "Master",
    filename: "chopin_heroic_polonaise_op53.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: true
  },
  {
    id: "debussy-reverie",
    title: "Rêverie",
    composer: "Claude Debussy",
    difficulty: "Intermediate",
    filename: "debussy_reverie.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: true
  },
  {
    id: "mozart-rondo-alla-turca",
    title: "Rondo Alla Turca",
    composer: "Wolfgang Amadeus Mozart",
    difficulty: "Intermediate",
    filename: "rousseau_mozart_rondo_alla_turca_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Classical",
    downloadable: false
  },
  {
    id: "alan-walker-darkside",
    title: "Darkside",
    composer: "Alan Walker",
    difficulty: "Intermediate",
    filename: "rousseau_alan_walker_darkside_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "k-391-and-alan-walker-ignite-ft-julie-bergan-and-seungri",
    title: "Ignite ft. Julie Bergan & Seungri",
    composer: "Alan Walker",
    difficulty: "Intermediate",
    filename: "rousseau_k_391_and_alan_walker_ignite_ft_julie_bergan_and_seungri_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "coldplay-the-scientist",
    title: "The Scientist",
    composer: "Coldplay",
    difficulty: "Intermediate",
    filename: "rousseau_coldplay_the_scientist_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "ludovico-einaudi-fly",
    title: "Fly",
    composer: "Ludovico Einaudi",
    difficulty: "Intermediate",
    filename: "rousseau_ludovico_einaudi_fly_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "ludovico-einaudi-nuvole-bianche",
    title: "Nuvole Bianche",
    composer: "Ludovico Einaudi",
    difficulty: "Intermediate",
    filename: "rousseau_ludovico_einaudi_nuvole_bianche_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "ludovico-einaudi-una-mattina",
    title: "Una Mattina",
    composer: "Ludovico Einaudi",
    difficulty: "Intermediate",
    filename: "rousseau_ludovico_einaudi_una_mattina_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "maroon-5-ft-cardi-b-girls-like-you",
    title: "Girls Like You",
    composer: "Maroon 5",
    difficulty: "Intermediate",
    filename: "rousseau_maroon_5_ft_cardi_b_girls_like_you_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "marshmello-and-anne-marie-friends",
    title: "FRIENDS",
    composer: "Marshmello",
    difficulty: "Intermediate",
    filename: "rousseau_marshmello_and_anne_marie_friends_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "marshmello-ft-bastille-happier",
    title: "Happier",
    composer: "Marshmello",
    difficulty: "Intermediate",
    filename: "rousseau_marshmello_ft_bastille_happier_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "post-malone-congratulations",
    title: "Congratulations",
    composer: "Post Malone",
    difficulty: "Intermediate",
    filename: "rousseau_post_malone_congratulations_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "post-malone-i-fall-apart",
    title: "I Fall Apart",
    composer: "Post Malone",
    difficulty: "Intermediate",
    filename: "rousseau_post_malone_i_fall_apart_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "thefatrat-mayday-ft-laura-brehm",
    title: "MAYDAY ft. Laura Brehm",
    composer: "TheFatRat",
    difficulty: "Intermediate",
    filename: "rousseau_thefatrat_mayday_ft_laura_brehm_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "yann-tiersen-comptine-dun-autre-ete",
    title: "Comptine d'un autre été",
    composer: "Yann Tiersen",
    difficulty: "Intermediate",
    filename: "rousseau_yann_tiersen_comptine_dun_autre_ete_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "yiruma-river-flows-in-you",
    title: "River Flows In You",
    composer: "Yiruma",
    difficulty: "Intermediate",
    filename: "rousseau_yiruma_river_flows_in_you_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "zedd-one-strange-rock",
    title: "One Strange Rock",
    composer: "Zedd",
    difficulty: "Intermediate",
    filename: "rousseau_zedd_one_strange_rock_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "zedd-maren-morris-and-grey-the-middle",
    title: "The Middle",
    composer: "Zedd",
    difficulty: "Intermediate",
    filename: "rousseau_zedd_maren_morris_and_grey_the_middle_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Pop/Modern",
    downloadable: false
  },
  {
    id: "fortnite-piano-medley",
    title: "Fortnite Piano Medley",
    composer: "Epic Games",
    difficulty: "Intermediate",
    filename: "rousseau_fortnite_piano_medley_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Game/Anime",
    downloadable: false
  },
  {
    id: "kingdom-hearts-dearly-beloved",
    title: "Dearly Beloved",
    composer: "Kingdom Hearts",
    difficulty: "Intermediate",
    filename: "rousseau_kingdom_hearts_dearly_beloved_rousseau_cover_midi.mid",
    attribution: "Rousseau",
    genre: "Game/Anime",
    downloadable: false
  },
  {
    id: "happy-birthday-if-it-were-played-by-liszt",
    title: "Happy Birthday (Liszt style)",
    composer: "Traditional (arr. Liszt)",
    difficulty: "Intermediate",
    filename: "rousseau_happy_birthday_if_it_were_played_by_liszt_rousseau_midi.mid",
    attribution: "Rousseau",
    genre: "Special",
    downloadable: false
  }
];
