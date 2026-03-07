# 本地开发说明

## 环境要求

推荐开发环境：

- Python 3.11+
- Rust toolchain
- Node.js 20+

根据使用场景，还需要：

- 至少一个可用的 LLM backend 配置
- `spaCy` 英文模型

## 安装依赖

### Python 与开发工具

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### API / 桌面相关依赖

如果需要运行 FastAPI 或桌面侧后端依赖，再安装：

```bash
pip install -e ".[desktop]"
```

### Rust 扩展

修改 `crates/tf-features/` 后，需要重新编译：

```bash
maturin develop
```

### NLP 模型

```bash
python -m spacy download en_core_web_sm
```

## LLM 后端配置

项目使用自定义 backend 配置，而不是写死单一供应商。

推荐流程：

```bash
cp backends.example.json backends.json
```

然后按需要填充：

- `provider`
- `model`
- `api_base`
- `api_key_env`

不要提交真实密钥或本地私有配置。

## 运行方式

## CLI

示例：

```bash
text analyze full sample/input.txt --llm your-backend
text analyze verify data/ --questioned q1 --reference-authors alice --llm your-backend
text extract sample/input.txt --output features.json
```

说明：

- 当前 CLI 命令以 `src/text/cli/main.py` 为准
- 任务子命令包括 `verify`、`closed-set-id`、`open-set-id`、`cluster`、`profile`、`sockpuppet`

## API

当前仓库中 FastAPI 采用应用工厂 `text.api.app:create_app`，本地开发可直接用 `uvicorn` 启动：

```bash
uvicorn text.api.app:create_app --factory --reload --host 127.0.0.1 --port 8000
```

如果出现模块找不到的问题，先确认已激活虚拟环境并完成 `pip install -e ".[desktop]"`。

## Web 前端

```bash
cd web
npm install
npm run dev
```

浏览器开发模式下，前端默认读取：

- `NEXT_PUBLIC_TEXT_API_ORIGIN`

若未显式配置，默认会请求 `http://127.0.0.1:8000`。

## 桌面端开发

桌面端基于 Tauri，前提是本地具备 Node.js 与 Rust 工具链。开发时通常先确保前端依赖已安装，并参考 `web/README.md` 与 `web/src-tauri/` 配置排查 sidecar 启动问题。

## 常用测试命令

### Python

```bash
pytest tests/
ruff check src tests
ruff format --check src tests
```

### Rust

```bash
cargo test --workspace
```

### 前端

```bash
cd web
npm run lint
npm run build
```

## 常见开发注意事项

- 修改 Rust 特征代码后必须重新执行 `maturin develop`
- 文档、命令和任务枚举以源码为准，不要只相信历史 README
- 前端能正常打开并不代表 sidecar 正常，桌面端问题要看 API 健康检查
- 新增任务类型时，需要同步更新 schema、CLI、API、前端筛选项与文档
