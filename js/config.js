// Публичные настройки подключения к Supabase.
// Эти значения по замыслу видны всем, кто откроет сайт, поэтому их можно хранить в коде и в git.
// Защита данных — правила Row Level Security в базе (см. supabase/01_schema.sql).
// НИКОГДА не добавляй сюда secret / service_role ключ или ключ нейросети.
window.PORCIYA_CONFIG = {
  supabaseUrl: "https://hjhkclhidtmgkehaeueq.supabase.co",
  supabasePublishableKey: "sb_publishable_nw_xDPkF5ziqktolMeuEHA_si1iqgX2",
  // Публичный VAPID-ключ для пуш-уведомлений (приватный — только в секретах Supabase)
  vapidPublicKey: "BKO7fUC2ViqB1OITSlP11sgFxUtRwXyhzjr7eVG31lcIiYq_nMo5kNjYpoJ4VBCS8QHCVCrYrRFNR8T-LhaNiNo",
};