# 轻聊 LiteChat

一个轻量级的即时聊天应用，支持文字、图片、视频、语音消息和链接预览分享。

## 功能

- 用户注册 / 登录（JWT 认证）
- 一对一私聊 + 群聊
- 发送文字消息（支持换行）
- 发送图片（点击放大预览，支持粘贴板粘贴图片）
- 发送视频（内嵌播放器）
- 发送语音（录音 + 波形显示）
- 分享链接（自动抓取标题/描述/封面图预览卡片）
- 未读消息计数
- 实时在线状态
- 正在输入提示
- 消息已读回执

## 技术栈

| 层       | 技术                                   |
|----------|----------------------------------------|
| 前端     | React 18 + TypeScript + Tailwind CSS   |
| 状态管理 | Zustand                                |
| 实时通信 | Socket.IO                              |
| 后端     | Node.js + Express                      |
| 数据库   | SQLite（better-sqlite3）               |
| 认证     | JWT                                    |
| 文件上传 | Multer（本地存储）                     |

## 启动方法

### 1. 启动后端

```bash
cd server
npm run dev
# 服务运行在 http://localhost:3001
```

### 2. 启动前端

```bash
cd client
npm run dev
# 前端运行在 http://localhost:3000
```

### 3. 打开浏览器

访问 http://localhost:3000，注册账号开始聊天。

## 目录结构

```
chat-app/
├── server/
│   ├── src/
│   │   ├── index.js         # 入口文件
│   │   ├── database.js      # SQLite 数据库 + Schema
│   │   ├── auth.js          # 注册/登录/JWT
│   │   ├── routes.js        # REST API 路由
│   │   ├── socket.js        # Socket.IO 实时通信
│   │   ├── upload.js        # 文件上传配置
│   │   └── linkPreview.js   # 链接预览抓取
│   └── uploads/             # 媒体文件存储
│       ├── images/
│       ├── videos/
│       └── voices/
└── client/
    └── src/
        ├── pages/           # 页面组件
        ├── components/      # UI 组件
        ├── store/           # Zustand 状态
        ├── hooks/           # 自定义 Hooks
        ├── types/           # TypeScript 类型
        └── utils/           # 工具函数
```

## 文件大小限制

| 类型 | 限制  |
|------|-------|
| 图片 | 20 MB |
| 视频 | 100 MB|
| 语音 | 10 MB |
| 头像 | 5 MB  |
