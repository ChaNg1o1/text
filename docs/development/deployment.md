# 部署与交付说明

## 部署形态

当前项目支持两种主要交付形态：

- 服务形态：以 FastAPI 方式运行，供 Web 前端或其他调用方访问
- 桌面形态：以前端 + Tauri + 嵌入式后端 sidecar 的方式交付最终用户

## FastAPI 服务部署

## 启动方式

推荐直接使用应用工厂启动：

```bash
uvicorn text.api.app:create_app --factory --host 127.0.0.1 --port 8000
```

开发环境可增加 `--reload`，生产环境不建议开启。

## 关键环境变量

后端运行时重点关注以下环境变量：

- `TEXT_HOST`
- `TEXT_PORT`
- `TEXT_PRELOAD_EMBEDDING`
- `TEXT_API_LOG_LEVEL`
- `TEXT_API_ACCESS_LOG`

此外，LLM backend 依赖对应的密钥环境变量，例如：

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- 其他与 `backends.json` 中 `api_key_env` 对应的变量

## 启动时初始化内容

根据 `src/text/api/app.py`，应用启动时会初始化：

- 分析记录存储
- 可观测性注册表
- 后台分析 worker
- 进度持久化回调
- embedding 预热（可关闭）

因此，部署排查时不要只看 HTTP 路由是否能启动，还应确认这些资源是否成功初始化。

## 健康检查

统一健康检查接口：

```text
/api/v1/health
```

它同时也是桌面 sidecar 启动完成与否的重要判断依据。

## 桌面端交付

## 交付目标

桌面端面向最终用户提供“开箱即用”的本地分析体验，不要求用户单独启动 Python API 服务。

## 构建方式

根据仓库说明，桌面交付建议使用：

```bash
scripts/release/build_desktop_bundle.sh
```

构建后产物位于：

```text
web/src-tauri/target/release/bundle
```

## sidecar 机制

Tauri 启动后会：

1. 解析后端二进制位置
2. 选择空闲端口
3. 启动 sidecar 进程
4. 轮询 `/api/v1/health`
5. 将 API origin 通过 `get_api_origin` 返回给前端

这意味着桌面端故障一般集中在以下几类：

- sidecar 二进制缺失
- sidecar 启动即退出
- 本地健康检查超时
- 平台签名或权限问题

## 配置管理

### Backend 配置

LLM backend 配置不应写入真实密钥。建议：

- 仓库中保留示例配置
- 运行环境通过环境变量注入密钥
- 本地用户配置与仓库默认配置分离

### 日志与调试

桌面 sidecar 存在调试开关，例如：

- `TEXT_TAURI_DEBUG_SIDECAR`
- `TEXT_TAURI_DEV_BACKEND`

这些变量适合内部排查开发态 sidecar 问题，不建议作为最终用户常规配置。

## 发布检查清单

- 确认 Python 依赖完整
- 确认 Rust 扩展已编译
- 确认前端已通过 `lint` 和 `build`
- 确认桌面端可正常拉起 sidecar
- 确认 `/api/v1/health` 正常
- 确认未提交真实 `backends.json`、`.env` 或密钥

## 维护建议

- 每次变更 API 启动方式、桌面打包方式或关键环境变量时，同步更新本文档
- 对外发布时优先交付桌面 bundle，不要求终端用户理解 Python/Rust/Node 运行细节
