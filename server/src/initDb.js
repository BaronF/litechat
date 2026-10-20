// Railway postinstall 时初始化数据库表结构
// 仅在 DATABASE_URL 存在时执行
if (!process.env.DATABASE_URL) {
  console.log('No DATABASE_URL found, skipping DB init');
  process.exit(0);
}

const { initSchema } = require('./database');

initSchema()
  .then(() => {
    console.log('DB init complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('DB init failed:', err);
    process.exit(1);
  });
