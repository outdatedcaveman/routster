/**
 * Routster Internationalization (i18n)
 * Lightweight translation system for 16 languages.
 */

const translations = {
  en: {
    inbox: 'Inbox', flows: 'Flows', settings: 'Settings',
    search: 'Search titles or URLs...', allCategories: 'All Categories',
    universalIngestion: 'Universal Ingestion (Links, Blocks of Text, DOIs)',
    pasteUrl: 'Paste a URL, an academic DOI, or a raw text note here... Or drag-and-drop a file over this box.',
    chooseFile: 'Choose File', pullChrome: 'Pull from Chrome', sendPipeline: 'Send to Pipeline',
    runExport: 'Run Export Pipeline', reclassify: 'Reclassify', deleteSelected: 'Delete Selected',
    type: 'Type', titleSource: 'Title & Source', integration: 'Integration', actions: 'Actions',
    connectors: 'Connectors', configureCredentials: 'Configure your service credentials. Each connector can be used in multiple flows below.',
    flowsTitle: 'Flows', flowsDesc: 'Define what happens when a link is classified into each category. Add multiple actions per category — they run in order.',
    welcome: 'Welcome to Routster', subtitle: 'Your universal, local-first automation engine.',
    getStarted: 'Get Started', launchRoutster: 'Launch Routster',
    defineCategories: 'Define Your First Categories',
    categoriesHint: 'Enter comma-separated names, e.g. "Work Invoices, Research Papers, Cool Apps, Read Later"',
    back: 'Back', save: 'Save', cancel: 'Cancel', test: 'Test Connection', setup: 'Set up', reconfigure: 'Reconfigure',
    darkMode: 'Dark Mode', lightMode: 'Light Mode',
    general: 'General', classifier: 'Classifier', apiWebhooks: 'API & Webhooks', triggers: 'Triggers',
    dataStorage: 'Data & Storage', advanced: 'Advanced', about: 'About',
    language: 'Language', theme: 'Theme', defaultCategory: 'Default Category',
    exportDb: 'Export Database', clearLinks: 'Clear All Links', resetLearned: 'Reset Learned Rules', clearRoutes: 'Clear All Routes'
  },
  pt: {
    inbox: 'Caixa de Entrada', flows: 'Fluxos', settings: 'Configurações',
    search: 'Buscar títulos ou URLs...', allCategories: 'Todas as Categorias',
    universalIngestion: 'Ingestão Universal (Links, Textos, DOIs)',
    pasteUrl: 'Cole uma URL, DOI acadêmico ou nota de texto aqui... Ou arraste e solte um arquivo.',
    chooseFile: 'Escolher Arquivo', pullChrome: 'Puxar do Chrome', sendPipeline: 'Enviar ao Pipeline',
    runExport: 'Executar Pipeline', reclassify: 'Reclassificar', deleteSelected: 'Excluir Selecionados',
    type: 'Tipo', titleSource: 'Título e Fonte', integration: 'Integração', actions: 'Ações',
    connectors: 'Conectores', configureCredentials: 'Configure suas credenciais de serviço. Cada conector pode ser usado em múltiplos fluxos abaixo.',
    flowsTitle: 'Fluxos', flowsDesc: 'Defina o que acontece quando um link é classificado em cada categoria.',
    welcome: 'Bem-vindo ao Routster', subtitle: 'Seu motor de automação universal e local.',
    getStarted: 'Começar', launchRoutster: 'Iniciar Routster',
    defineCategories: 'Defina Suas Primeiras Categorias',
    categoriesHint: 'Digite nomes separados por vírgula, ex: "Faturas, Artigos, Apps Legais"',
    back: 'Voltar', save: 'Salvar', cancel: 'Cancelar', test: 'Testar Conexão', setup: 'Configurar', reconfigure: 'Reconfigurar',
    darkMode: 'Modo Escuro', lightMode: 'Modo Claro',
    general: 'Geral', classifier: 'Classificador', apiWebhooks: 'API e Webhooks', triggers: 'Gatilhos',
    dataStorage: 'Dados e Armazenamento', advanced: 'Avançado', about: 'Sobre',
    language: 'Idioma', theme: 'Tema', defaultCategory: 'Categoria Padrão',
    exportDb: 'Exportar Banco de Dados', clearLinks: 'Limpar Todos os Links', resetLearned: 'Resetar Regras Aprendidas', clearRoutes: 'Limpar Todos os Fluxos'
  },
  es: {
    inbox: 'Bandeja', flows: 'Flujos', settings: 'Configuración',
    search: 'Buscar títulos o URLs...', allCategories: 'Todas las Categorías',
    universalIngestion: 'Ingesta Universal (Enlaces, Textos, DOIs)',
    pasteUrl: 'Pega una URL, DOI académico o nota de texto aquí... O arrastra un archivo.',
    chooseFile: 'Elegir Archivo', pullChrome: 'Extraer de Chrome', sendPipeline: 'Enviar al Pipeline',
    runExport: 'Ejecutar Pipeline', reclassify: 'Reclasificar', deleteSelected: 'Eliminar Seleccionados',
    type: 'Tipo', titleSource: 'Título y Fuente', integration: 'Integración', actions: 'Acciones',
    connectors: 'Conectores', welcome: 'Bienvenido a Routster', subtitle: 'Tu motor de automatización universal y local.',
    getStarted: 'Empezar', back: 'Atrás', save: 'Guardar', cancel: 'Cancelar', test: 'Probar Conexión',
    setup: 'Configurar', reconfigure: 'Reconfigurar', general: 'General', classifier: 'Clasificador',
    language: 'Idioma', theme: 'Tema', about: 'Acerca de',
    exportDb: 'Exportar Base de Datos', clearLinks: 'Borrar Todos los Enlaces'
  },
  // Stubs for remaining languages — same keys with localized values
  fr: { inbox: 'Boîte de réception', flows: 'Flux', settings: 'Paramètres', search: 'Rechercher...', welcome: 'Bienvenue sur Routster', getStarted: 'Commencer', save: 'Enregistrer', cancel: 'Annuler', general: 'Général', about: 'À propos', language: 'Langue', theme: 'Thème' },
  de: { inbox: 'Posteingang', flows: 'Flüsse', settings: 'Einstellungen', search: 'Suchen...', welcome: 'Willkommen bei Routster', getStarted: 'Loslegen', save: 'Speichern', cancel: 'Abbrechen', general: 'Allgemein', about: 'Über', language: 'Sprache', theme: 'Thema' },
  zh: { inbox: '收件箱', flows: '流程', settings: '设置', search: '搜索...', welcome: '欢迎使用Routster', getStarted: '开始', save: '保存', cancel: '取消', general: '通用', about: '关于', language: '语言', theme: '主题' },
  ja: { inbox: '受信箱', flows: 'フロー', settings: '設定', search: '検索...', welcome: 'Routsterへようこそ', getStarted: '始める', save: '保存', cancel: 'キャンセル', general: '一般', about: '情報', language: '言語', theme: 'テーマ' },
  ko: { inbox: '받은편지함', flows: '플로우', settings: '설정', search: '검색...', welcome: 'Routster에 오신 것을 환영합니다', getStarted: '시작', save: '저장', cancel: '취소', general: '일반', about: '정보', language: '언어', theme: '테마' },
  ru: { inbox: 'Входящие', flows: 'Потоки', settings: 'Настройки', search: 'Поиск...', welcome: 'Добро пожаловать в Routster', getStarted: 'Начать', save: 'Сохранить', cancel: 'Отмена', general: 'Общие', about: 'О программе', language: 'Язык', theme: 'Тема' },
  ar: { inbox: 'البريد الوارد', flows: 'التدفقات', settings: 'الإعدادات', search: 'بحث...', welcome: 'مرحبًا بك في Routster', getStarted: 'ابدأ', save: 'حفظ', cancel: 'إلغاء', general: 'عام', about: 'حول', language: 'اللغة', theme: 'السمة' },
  hi: { inbox: 'इनबॉक्स', flows: 'फ़्लो', settings: 'सेटिंग्स', search: 'खोजें...', welcome: 'Routster में आपका स्वागत है', getStarted: 'शुरू करें', save: 'सहेजें', cancel: 'रद्द करें', general: 'सामान्य', about: 'के बारे में', language: 'भाषा', theme: 'थीम' },
  it: { inbox: 'Posta in arrivo', flows: 'Flussi', settings: 'Impostazioni', search: 'Cerca...', welcome: 'Benvenuto su Routster', getStarted: 'Inizia', save: 'Salva', cancel: 'Annulla', general: 'Generale', about: 'Info', language: 'Lingua', theme: 'Tema' },
  nl: { inbox: 'Inbox', flows: 'Stromen', settings: 'Instellingen', search: 'Zoeken...', welcome: 'Welkom bij Routster', getStarted: 'Begin', save: 'Opslaan', cancel: 'Annuleren', general: 'Algemeen', about: 'Over', language: 'Taal', theme: 'Thema' },
  pl: { inbox: 'Skrzynka', flows: 'Przepływy', settings: 'Ustawienia', search: 'Szukaj...', welcome: 'Witaj w Routster', getStarted: 'Zacznij', save: 'Zapisz', cancel: 'Anuluj', general: 'Ogólne', about: 'O programie', language: 'Język', theme: 'Motyw' },
  tr: { inbox: 'Gelen Kutusu', flows: 'Akışlar', settings: 'Ayarlar', search: 'Ara...', welcome: 'Routster\'a Hoş Geldiniz', getStarted: 'Başla', save: 'Kaydet', cancel: 'İptal', general: 'Genel', about: 'Hakkında', language: 'Dil', theme: 'Tema' },
  vi: { inbox: 'Hộp thư', flows: 'Luồng', settings: 'Cài đặt', search: 'Tìm kiếm...', welcome: 'Chào mừng đến Routster', getStarted: 'Bắt đầu', save: 'Lưu', cancel: 'Hủy', general: 'Chung', about: 'Giới thiệu', language: 'Ngôn ngữ', theme: 'Giao diện' }
};

let currentLang = 'en';

export function setLanguage(lang) {
  currentLang = lang;
}

export function t(key) {
  const dict = translations[currentLang] || translations.en;
  return dict[key] || translations.en[key] || key;
}

export default translations;
