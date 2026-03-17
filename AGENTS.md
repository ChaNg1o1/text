# Repository Guidelines

## Project Structure & Module Organization
- `src/text/`: Python package (CLI, ingest, feature extraction, LLM integration, multi-agent orchestration, report rendering).
- `crates/tf-features/`: Rust PyO3 extension (`text._tf_features`) for high-performance lexical/syntactic/ngram/unicode features.
- `web/`: Next.js frontend (`src/app`, `src/components`, `src/hooks`, `src/lib`, `src/stores`).
- `tests/`: Python test area and fixtures (`tests/fixtures/`).
- `data/`, `sample/`, `output/`, `docs/`: datasets, example inputs/reports, generated outputs, and design notes.

## Build, Test, and Development Commands
- `pip install -e ".[dev]"`: install Python package and dev tooling.
- `pip install -e ".[web]"`: install FastAPI/uvicorn API dependencies.
- `maturin develop`: build and install Rust extension into current Python environment.
- `python -m spacy download en_core_web_sm`: install required NLP model.
- `text analyze full sample/<file> --llm <backend>`: run full CLI analysis.
- `text serve --reload --port 8000`: run API server locally.
- `pytest tests/`: run Python tests.
- `cargo test --workspace`: run Rust tests.
- `ruff check src tests && ruff format --check src tests`: lint/format validation.
- `cd web && npm install && npm run dev`: run frontend; use `npm run lint` and `npm run build` before merge.

## Coding Style & Naming Conventions
- Python: 4-space indentation, Ruff-managed style, max line length `100`.
- Python naming: `snake_case` for functions/modules, `PascalCase` for classes/Pydantic models, explicit type hints for public APIs.
- TypeScript/React: component exports in `PascalCase`; hooks start with `use` (e.g., `use-analysis.ts`).
- Rust: Edition 2021 defaults; modules/functions in `snake_case`.

## Testing Guidelines
- Prefer `pytest` + `pytest-asyncio` for backend and async flows.
- Name tests as `tests/test_<feature>.py`.
- Keep sample payloads and golden data under `tests/fixtures/`.
- Add regression tests for ingest parsing, feature extraction fallbacks, API route behavior, and agent orchestration errors.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history, e.g., `refactor: normalize CLI with grouped subcommands`.
- Keep commits focused and atomic; include code + tests together.
- PRs should include: purpose, key changes, validation commands run, and linked issue/task.
- For UI changes, attach screenshots or short recordings.
- Do not commit secrets (`backends.json`, API keys, `.env`); use `backends.example.json` + environment variables.

<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke: Bash("openskills read <skill-name>")
- The skill content will load with detailed instructions on how to complete the task
- Base directory provided in output for resolving bundled resources (references/, scripts/, assets/)

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
</usage>

<available_skills>

<skill>
<name>ab-test-setup</name>
<description>When the user wants to plan, design, or implement an A/B test or experiment. Also use when the user mentions "A/B test," "split test," "experiment," "test this change," "variant copy," "multivariate test," "hypothesis," "should I test this," "which version is better," "test two versions," "statistical significance," or "how long should I run this test." Use this whenever someone is comparing two approaches and wants to measure which performs better. For tracking implementation, see analytics-tracking. For page-level conversion optimization, see page-cro.</description>
<location>global</location>
</skill>

<skill>
<name>academic-literature-search</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>actionbook</name>
<description>Activate when the user needs to interact with any website — browser automation, web scraping, screenshots, form filling, UI testing, monitoring, or building AI agents. Provides verified action manuals with step-by-step instructions and pre-tested selectors.</description>
<location>global</location>
</skill>

<skill>
<name>actionbook-rs</name>
<description>High-performance Rust CLI for browser automation using the system browser via CDP (Chrome DevTools Protocol). Use when the user needs fast, lightweight browser automation - navigating websites, clicking elements, filling forms, taking screenshots, extracting text, executing JavaScript, managing cookies, or running headless browser tasks. Prefer over agent-browser when speed, minimal footprint, or CI/CD usage is important. Triggers on "actionbook", "browser automation", "CDP", "headless browser", "screenshot", "web scraping", "form filling", "browser testing".</description>
<location>global</location>
</skill>

<skill>
<name>active-directory-attacks</name>
<description>"This skill should be used when the user asks to \"attack Active Directory\", \"exploit AD\", \"Kerberoasting\", \"DCSync\", \"pass-the-hash\", \"BloodHound enumeration\", \"Golden Ticket\", ..."</description>
<location>global</location>
</skill>

<skill>
<name>active-research</name>
<description>Deep research and analysis tool. Generates comprehensive HTML reports on any topic, domain, paper, or technology. Use when user asks to research, analyze, investigate, deep-dive, or generate a report on any subject. Supports academic papers (arXiv), technologies, trends, comparisons, and general topics.</description>
<location>global</location>
</skill>

<skill>
<name>ad-creative</name>
<description>"When the user wants to generate, iterate, or scale ad creative — headlines, descriptions, primary text, or full ad variations — for any paid advertising platform. Also use when the user mentions 'ad copy variations,' 'ad creative,' 'generate headlines,' 'RSA headlines,' 'bulk ad copy,' 'ad iterations,' 'creative testing,' 'ad performance optimization,' 'write me some ads,' 'Facebook ad copy,' 'Google ad headlines,' 'LinkedIn ad text,' or 'I need more ad variations.' Use this whenever someone needs to produce ad copy at scale or iterate on existing ads. For campaign strategy and targeting, see paid-ads. For landing page copy, see copywriting."</description>
<location>global</location>
</skill>

<skill>
<name>adapt</name>
<description>Adapt designs to work across different screen sizes, devices, contexts, or platforms. Ensures consistent experience across varied environments.</description>
<location>global</location>
</skill>

<skill>
<name>adaptyv</name>
<description>Cloud laboratory platform for automated protein testing and validation. Use when designing proteins and needing experimental validation including binding assays, expression testing, thermostability measurements, enzyme activity assays, or protein sequence optimization. Also use for submitting experiments via API, tracking experiment status, downloading results, optimizing protein sequences for better expression using computational tools (NetSolP, SoluProt, SolubleMPNN, ESM), or managing protein design workflows with wet-lab validation.</description>
<location>global</location>
</skill>

<skill>
<name>aeon</name>
<description>This skill should be used for time series machine learning tasks including classification, regression, clustering, forecasting, anomaly detection, segmentation, and similarity search. Use when working with temporal data, sequential patterns, or time-indexed observations requiring specialized algorithms beyond standard ML approaches. Particularly suited for univariate and multivariate time series analysis with scikit-learn compatible APIs.</description>
<location>global</location>
</skill>

<skill>
<name>agent-browser</name>
<description>Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, test web applications, or extract information from web pages.</description>
<location>global</location>
</skill>

<skill>
<name>ai-model-nodejs</name>
<description>Use this skill when developing Node.js backend services or CloudBase cloud functions (Express/Koa/NestJS, serverless, backend APIs) that need AI capabilities. Features text generation (generateText), streaming (streamText), AND image generation (generateImage) via @cloudbase/node-sdk ≥3.16.0. Built-in models include Hunyuan (hunyuan-2.0-instruct-20251111 recommended), DeepSeek (deepseek-v3.2 recommended), and hunyuan-image for images. This is the ONLY SDK that supports image generation. NOT for browser/Web apps (use ai-model-web) or WeChat Mini Program (use ai-model-wechat).</description>
<location>global</location>
</skill>

<skill>
<name>ai-model-web</name>
<description>Use this skill when developing browser/Web applications (React/Vue/Angular, static websites, SPAs) that need AI capabilities. Features text generation (generateText) and streaming (streamText) via @cloudbase/js-sdk. Built-in models include Hunyuan (hunyuan-2.0-instruct-20251111 recommended) and DeepSeek (deepseek-v3.2 recommended). NOT for Node.js backend (use ai-model-nodejs), WeChat Mini Program (use ai-model-wechat), or image generation (Node SDK only).</description>
<location>global</location>
</skill>

<skill>
<name>ai-model-wechat</name>
<description>Use this skill when developing WeChat Mini Programs (小程序, 企业微信小程序, wx.cloud-based apps) that need AI capabilities. Features text generation (generateText) and streaming (streamText) with callback support (onText, onEvent, onFinish) via wx.cloud.extend.AI. Built-in models include Hunyuan (hunyuan-2.0-instruct-20251111 recommended) and DeepSeek (deepseek-v3.2 recommended). API differs from JS/Node SDK - streamText requires data wrapper, generateText returns raw response. NOT for browser/Web apps (use ai-model-web), Node.js backend (use ai-model-nodejs), or image generation (not supported).</description>
<location>global</location>
</skill>

<skill>
<name>ai-seo</name>
<description>"When the user wants to optimize content for AI search engines, get cited by LLMs, or appear in AI-generated answers. Also use when the user mentions 'AI SEO,' 'AEO,' 'GEO,' 'LLMO,' 'answer engine optimization,' 'generative engine optimization,' 'LLM optimization,' 'AI Overviews,' 'optimize for ChatGPT,' 'optimize for Perplexity,' 'AI citations,' 'AI visibility,' 'zero-click search,' 'how do I show up in AI answers,' 'LLM mentions,' or 'optimize for Claude/Gemini.' Use this whenever someone wants their content to be cited or surfaced by AI assistants and AI search engines. For traditional technical and on-page SEO audits, see seo-audit. For structured data implementation, see schema-markup."</description>
<location>global</location>
</skill>

<skill>
<name>alphafold-database</name>
<description>Access AlphaFold 200M+ AI-predicted protein structures. Retrieve structures by UniProt ID, download PDB/mmCIF files, analyze confidence metrics (pLDDT, PAE), for drug discovery and structural biology.</description>
<location>global</location>
</skill>

<skill>
<name>alphaxiv-paper-lookup</name>
<description>Look up any arxiv paper on alphaxiv.org to get a structured AI-generated overview. This is faster and more reliable than trying to read a raw PDF.</description>
<location>global</location>
</skill>

<skill>
<name>analytics-tracking</name>
<description>When the user wants to set up, improve, or audit analytics tracking and measurement. Also use when the user mentions "set up tracking," "GA4," "Google Analytics," "conversion tracking," "event tracking," "UTM parameters," "tag manager," "GTM," "analytics implementation," "tracking plan," "how do I measure this," "track conversions," "attribution," "Mixpanel," "Segment," "are my events firing," or "analytics isn't working." Use this whenever someone asks how to know if something is working or wants to measure marketing results. For A/B test measurement, see ab-test-setup.</description>
<location>global</location>
</skill>

<skill>
<name>analyze_lab_video_cell_behavior</name>
<description>Automated cell behavior analysis from microscopy or XR lab recordings. Classifies cell motion phenotypes (migration, proliferation, apoptosis, division, quiescence), computes population-level quantitative metrics (growth rate, migration velocity, directionality index), and emits structured JSON for downstream reporting, plotting, or ELN integration.</description>
<location>global</location>
</skill>

<skill>
<name>animate</name>
<description>Review a feature and enhance it with purposeful animations, micro-interactions, and motion effects that improve usability and delight.</description>
<location>global</location>
</skill>

<skill>
<name>anndata</name>
<description>Data structure for annotated matrices in single-cell analysis. Use when working with .h5ad files or integrating with the scverse ecosystem. This is the data format skill—for analysis workflows use scanpy; for probabilistic models use scvi-tools; for population-scale queries use cellxgene-census.</description>
<location>global</location>
</skill>

<skill>
<name>api-security-testing</name>
<description>API安全测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>apktool</name>
<description>Android APK unpacking and resource extraction tool for reverse engineering. Use when you need to decode APK files, extract resources, examine AndroidManifest.xml, analyze smali code, or repackage modified APKs.</description>
<location>global</location>
</skill>

<skill>
<name>arboreto</name>
<description>Infer gene regulatory networks (GRNs) from gene expression data using scalable algorithms (GRNBoost2, GENIE3). Use when analyzing transcriptomics data (bulk RNA-seq, single-cell RNA-seq) to identify transcription factor-target gene relationships and regulatory interactions. Supports distributed computation for large-scale datasets.</description>
<location>global</location>
</skill>

<skill>
<name>article-writing</name>
<description>Write articles, guides, blog posts, tutorials, newsletter issues, and other long-form content in a distinctive voice derived from supplied examples or brand guidance. Use when the user wants polished written content longer than a paragraph, especially when voice consistency, structure, and credibility matter.</description>
<location>global</location>
</skill>

<skill>
<name>arxiv-search</name>
<description>Search arXiv physics, math, and computer science preprints using natural language queries. Powered by Valyu semantic search.</description>
<location>global</location>
</skill>

<skill>
<name>audit</name>
<description>Perform comprehensive audit of interface quality across accessibility, performance, theming, and responsive design. Generates detailed report of issues with severity ratings and recommendations.</description>
<location>global</location>
</skill>

<skill>
<name>auth-nodejs-cloudbase</name>
<description>Complete guide for CloudBase Auth using the CloudBase Node SDK – caller identity, user lookup, custom login tickets, and server-side best practices.</description>
<location>global</location>
</skill>

<skill>
<name>auth-tool-cloudbase</name>
<description>Use CloudBase Auth tool to configure and manage authentication providers for web applications - enable/disable login methods (SMS, Email, WeChat Open Platform, Google, Anonymous, Username/password, OAuth, SAML, CAS, Dingding, etc.) and configure provider settings via MCP tools `callCloudApi`.</description>
<location>global</location>
</skill>

<skill>
<name>auth-web-cloudbase</name>
<description>CloudBase Web Authentication Quick Guide - Provides concise and practical Web frontend authentication solutions with multiple login methods and complete user management.</description>
<location>global</location>
</skill>

<skill>
<name>auth-wechat-miniprogram</name>
<description>Complete guide for WeChat Mini Program authentication with CloudBase - native login, user identity, and cloud function integration.</description>
<location>global</location>
</skill>

<skill>
<name>benchling-integration</name>
<description>Benchling R&D platform integration. Access registry (DNA, proteins), inventory, ELN entries, workflows via API, build Benchling Apps, query Data Warehouse, for lab data management automation.</description>
<location>global</location>
</skill>

<skill>
<name>binary-analysis-patterns</name>
<description>Master binary analysis patterns including disassembly, decompilation, control flow analysis, and code pattern recognition. Use when analyzing executables, understanding compiled code, or performing static analysis on binaries.</description>
<location>global</location>
</skill>

<skill>
<name>bioinformatics</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>biomedical-search</name>
<description>Complete biomedical information search combining PubMed, preprints, clinical trials, and FDA drug labels. Powered by Valyu semantic search.</description>
<location>global</location>
</skill>

<skill>
<name>biomni</name>
<description>Autonomous biomedical AI agent framework for executing complex research tasks across genomics, drug discovery, molecular biology, and clinical analysis. Use this skill when conducting multi-step biomedical research including CRISPR screening design, single-cell RNA-seq analysis, ADMET prediction, GWAS interpretation, rare disease diagnosis, or lab protocol optimization. Leverages LLM reasoning with code execution and integrated biomedical databases.</description>
<location>global</location>
</skill>

<skill>
<name>biopython</name>
<description>Comprehensive molecular biology toolkit. Use for sequence manipulation, file parsing (FASTA/GenBank/PDB), phylogenetics, and programmatic NCBI/PubMed access (Bio.Entrez). Best for batch processing, custom bioinformatics pipelines, BLAST automation. For quick lookups use gget; for multi-service integration use bioservices.</description>
<location>global</location>
</skill>

<skill>
<name>biorxiv-database</name>
<description>Efficient database search tool for bioRxiv preprint server. Use this skill when searching for life sciences preprints by keywords, authors, date ranges, or categories, retrieving paper metadata, downloading PDFs, or conducting literature reviews.</description>
<location>global</location>
</skill>

<skill>
<name>biorxiv-search</name>
<description>Search bioRxiv biology preprints with natural language queries. Semantic search powered by Valyu.</description>
<location>global</location>
</skill>

<skill>
<name>bioservices</name>
<description>Unified Python interface to 40+ bioinformatics services. Use when querying multiple databases (UniProt, KEGG, ChEMBL, Reactome) in a single workflow with consistent API. Best for cross-database analysis, ID mapping across services. For quick single-database lookups use gget; for sequence/file manipulation use biopython.</description>
<location>global</location>
</skill>

<skill>
<name>bolder</name>
<description>Amplify safe or boring designs to make them more visually interesting and stimulating. Increases impact while maintaining usability.</description>
<location>global</location>
</skill>

<skill>
<name>brenda-database</name>
<description>Access BRENDA enzyme database via SOAP API. Retrieve kinetic parameters (Km, kcat), reaction equations, organism data, and substrate-specific enzyme information for biochemical research and metabolic pathway analysis.</description>
<location>global</location>
</skill>

<skill>
<name>business-logic-testing</name>
<description>业务逻辑漏洞测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>cellxgene-census</name>
<description>Query the CELLxGENE Census (61M+ cells) programmatically. Use when you need expression data across tissues, diseases, or cell types from the largest curated single-cell atlas. Best for population-scale queries, reference atlas comparisons. For analyzing your own data use scanpy or scvi-tools.</description>
<location>global</location>
</skill>

<skill>
<name>chembl-database</name>
<description>Query ChEMBL bioactive molecules and drug discovery data. Search compounds by structure/properties, retrieve bioactivity data (IC50, Ki), find inhibitors, perform SAR studies, for medicinal chemistry.</description>
<location>global</location>
</skill>

<skill>
<name>chembl-search</name>
<description>Search ChEMBL bioactive molecules database with natural language queries. Find compounds and assay data with Valyu semantic search.</description>
<location>global</location>
</skill>

<skill>
<name>chemistry</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>churn-prevention</name>
<description>"When the user wants to reduce churn, build cancellation flows, set up save offers, recover failed payments, or implement retention strategies. Also use when the user mentions 'churn,' 'cancel flow,' 'offboarding,' 'save offer,' 'dunning,' 'failed payment recovery,' 'win-back,' 'retention,' 'exit survey,' 'pause subscription,' 'involuntary churn,' 'people keep canceling,' 'churn rate is too high,' 'how do I keep users,' or 'customers are leaving.' Use this whenever someone is losing subscribers or wants to build systems to prevent it. For post-cancel win-back email sequences, see email-sequence. For in-app upgrade paywalls, see paywall-upgrade-cro."</description>
<location>global</location>
</skill>

<skill>
<name>citation-management</name>
<description>Comprehensive citation management for academic research. Search Google Scholar and PubMed for papers, extract accurate metadata, validate citations, and generate properly formatted BibTeX entries. This skill should be used when you need to find papers, verify citation information, convert DOIs to BibTeX, or ensure reference accuracy in scientific writing.</description>
<location>global</location>
</skill>

<skill>
<name>clarify</name>
<description>Improve unclear UX copy, error messages, microcopy, labels, and instructions. Makes interfaces easier to understand and use.</description>
<location>global</location>
</skill>

<skill>
<name>clinical</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>clinical-decision-support</name>
<description>Generate professional clinical decision support (CDS) documents for pharmaceutical and clinical research settings, including patient cohort analyses (biomarker-stratified with outcomes) and treatment recommendation reports (evidence-based guidelines with decision algorithms). Supports GRADE evidence grading, statistical analysis (hazard ratios, survival curves, waterfall plots), biomarker integration, and regulatory compliance. Outputs publication-ready LaTeX/PDF format optimized for drug development, clinical research, and evidence synthesis.</description>
<location>global</location>
</skill>

<skill>
<name>clinical-reports</name>
<description>Write comprehensive clinical reports including case reports (CARE guidelines), diagnostic reports (radiology/pathology/lab), clinical trial reports (ICH-E3, SAE, CSR), and patient documentation (SOAP, H&P, discharge summaries). Full support with templates, regulatory compliance (HIPAA, FDA, ICH-GCP), and validation tools.</description>
<location>global</location>
</skill>

<skill>
<name>clinical-trials-search</name>
<description>Search ClinicalTrials.gov with natural language queries. Find clinical trials, enrollment, and outcomes using Valyu semantic search.</description>
<location>global</location>
</skill>

<skill>
<name>clinicaltrials-database</name>
<description>Query ClinicalTrials.gov via API v2. Search trials by condition, drug, location, status, or phase. Retrieve trial details by NCT ID, export data, for clinical research and patient matching.</description>
<location>global</location>
</skill>

<skill>
<name>clinpgx-database</name>
<description>Access ClinPGx pharmacogenomics data (successor to PharmGKB). Query gene-drug interactions, CPIC guidelines, allele functions, for precision medicine and genotype-guided dosing decisions.</description>
<location>global</location>
</skill>

<skill>
<name>clinvar-database</name>
<description>Query NCBI ClinVar for variant clinical significance. Search by gene/position, interpret pathogenicity classifications, access via E-utilities API or FTP, annotate VCFs, for genomic medicine.</description>
<location>global</location>
</skill>

<skill>
<name>cloud-functions</name>
<description>Complete guide for CloudBase cloud functions development - supports both Event Functions (Node.js) and HTTP Functions (multi-language Web services). Covers runtime selection, deployment, logging, invocation, scf_bootstrap, SSE, WebSocket, and HTTP access configuration.</description>
<location>global</location>
</skill>

<skill>
<name>cloud-security-audit</name>
<description>云安全审计的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>cloud-storage-web</name>
<description>Complete guide for CloudBase cloud storage using Web SDK (@cloudbase/js-sdk) - upload, download, temporary URLs, file management, and best practices.</description>
<location>global</location>
</skill>

<skill>
<name>cloudbase</name>
<description>Essential CloudBase (TCB, Tencent CloudBase, 云开发, 微信云开发) development guidelines. MUST read when working with CloudBase projects, developing web apps, mini programs, backend services, fullstack development, static deployment, cloud functions, mysql/nosql database, authentication, cloud storage, web search or AI(LLM streaming) using CloudBase platform. Great supabase alternative.</description>
<location>global</location>
</skill>

<skill>
<name>cloudbase-agent-ts</name>
<description>"Build and deploy AI agents with Cloudbase Agent (TypeScript), a TypeScript SDK implementing the AG-UI protocol. Use when: (1) deploying agent servers with @cloudbase/agent-server, (2) using LangGraph adapter with ClientStateAnnotation, (3) using LangChain adapter with clientTools(), (4) building custom adapters that implement AbstractAgent, (5) understanding AG-UI protocol events, (6) building web UI clients with @ag-ui/client, (7) building WeChat Mini Program UIs with @cloudbase/agent-ui-miniprogram."</description>
<location>global</location>
</skill>

<skill>
<name>cloudbase-document-database-in-wechat-miniprogram</name>
<description>Use CloudBase document database WeChat MiniProgram SDK to query, create, update, and delete data. Supports complex queries, pagination, aggregation, and geolocation queries.</description>
<location>global</location>
</skill>

<skill>
<name>cloudbase-document-database-web-sdk</name>
<description>Use CloudBase document database Web SDK to query, create, update, and delete data. Supports complex queries, pagination, aggregation, and geolocation queries.</description>
<location>global</location>
</skill>

<skill>
<name>cloudbase-platform</name>
<description>CloudBase platform knowledge and best practices. Use this skill for general CloudBase platform understanding, including storage, hosting, authentication, cloud functions, database permissions, and data models.</description>
<location>global</location>
</skill>

<skill>
<name>cloudrun-development</name>
<description>CloudBase Run backend development rules (Function mode/Container mode). Use this skill when deploying backend services that require long connections, multi-language support, custom environments, or AI agent development.</description>
<location>global</location>
</skill>

<skill>
<name>cobrapy</name>
<description>Constraint-based metabolic modeling (COBRA). FBA, FVA, gene knockouts, flux sampling, SBML models, for systems biology and metabolic engineering analysis.</description>
<location>global</location>
</skill>

<skill>
<name>codex</name>
<description>Use when the user asks to run Codex CLI (codex exec, codex resume) or references OpenAI Codex for code analysis, refactoring, or automated editing</description>
<location>global</location>
</skill>

<skill>
<name>cold-email</name>
<description>Write B2B cold emails and follow-up sequences that get replies. Use when the user wants to write cold outreach emails, prospecting emails, cold email campaigns, sales development emails, or SDR emails. Also use when the user mentions "cold outreach," "prospecting email," "outbound email," "email to leads," "reach out to prospects," "sales email," "follow-up email sequence," "nobody's replying to my emails," or "how do I write a cold email." Covers subject lines, opening lines, body copy, CTAs, personalization, and multi-touch follow-up sequences. For warm/lifecycle email sequences, see email-sequence. For sales collateral beyond emails, see sales-enablement.</description>
<location>global</location>
</skill>

<skill>
<name>colorize</name>
<description>Add strategic color to features that are too monochromatic or lack visual interest. Makes interfaces more engaging and expressive.</description>
<location>global</location>
</skill>

<skill>
<name>command-injection-testing</name>
<description>命令注入漏洞测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>competitor-alternatives</name>
<description>"When the user wants to create competitor comparison or alternative pages for SEO and sales enablement. Also use when the user mentions 'alternative page,' 'vs page,' 'competitor comparison,' 'comparison page,' '[Product] vs [Product],' '[Product] alternative,' 'competitive landing pages,' 'how do we compare to X,' 'battle card,' or 'competitor teardown.' Use this for any content that positions your product against competitors. Covers four formats: singular alternative, plural alternatives, you vs competitor, and competitor vs competitor. For sales-specific competitor docs, see sales-enablement."</description>
<location>global</location>
</skill>

<skill>
<name>container-security-testing</name>
<description>容器安全测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>content-strategy</name>
<description>When the user wants to plan a content strategy, decide what content to create, or figure out what topics to cover. Also use when the user mentions "content strategy," "what should I write about," "content ideas," "blog strategy," "topic clusters," "content planning," "editorial calendar," "content marketing," "content roadmap," "what content should I create," "blog topics," "content pillars," or "I don't know what to write." Use this whenever someone needs help deciding what content to produce, not just writing it. For writing individual pieces, see copywriting. For SEO-specific audits, see seo-audit. For social media content specifically, see social-content.</description>
<location>global</location>
</skill>

<skill>
<name>copy-editing</name>
<description>"When the user wants to edit, review, or improve existing marketing copy. Also use when the user mentions 'edit this copy,' 'review my copy,' 'copy feedback,' 'proofread,' 'polish this,' 'make this better,' 'copy sweep,' 'tighten this up,' 'this reads awkwardly,' 'clean up this text,' 'too wordy,' or 'sharpen the messaging.' Use this when the user already has copy and wants it improved rather than rewritten from scratch. For writing new copy, see copywriting."</description>
<location>global</location>
</skill>

<skill>
<name>copywriting</name>
<description>When the user wants to write, rewrite, or improve marketing copy for any page — including homepage, landing pages, pricing pages, feature pages, about pages, or product pages. Also use when the user says "write copy for," "improve this copy," "rewrite this page," "marketing copy," "headline help," "CTA copy," "value proposition," "tagline," "subheadline," "hero section copy," "above the fold," "this copy is weak," "make this more compelling," or "help me describe my product." Use this whenever someone is working on website text that needs to persuade or convert. For email copy, see email-sequence. For popup copy, see popup-cro. For editing existing copy, see copy-editing.</description>
<location>global</location>
</skill>

<skill>
<name>cosmic-database</name>
<description>Access COSMIC cancer mutation database. Query somatic mutations, Cancer Gene Census, mutational signatures, gene fusions, for cancer research and precision oncology. Requires authentication.</description>
<location>global</location>
</skill>

<skill>
<name>critique</name>
<description>Evaluate design effectiveness from a UX perspective. Assesses visual hierarchy, information architecture, emotional resonance, and overall design quality with actionable feedback.</description>
<location>global</location>
</skill>

<skill>
<name>csrf-testing</name>
<description>CSRF跨站请求伪造测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>ctf-osint</name>
<description>Open Source Intelligence techniques for CTF challenges. Use when gathering information from public sources, social media, geolocation, or identifying unknown data.</description>
<location>global</location>
</skill>

<skill>
<name>dask</name>
<description>Distributed computing for larger-than-RAM pandas/NumPy workflows. Use when you need to scale existing pandas/NumPy code beyond memory or across clusters. Best for parallel file processing, distributed ML, integration with existing pandas code. For out-of-core analytics on single machine use vaex; for in-memory speed use polars.</description>
<location>global</location>
</skill>

<skill>
<name>data-model-creation</name>
<description>Optional advanced tool for complex data modeling. For simple table creation, use relational-database-tool directly with SQL statements.</description>
<location>global</location>
</skill>

<skill>
<name>datamol</name>
<description>Pythonic wrapper around RDKit with simplified interface and sensible defaults. Preferred for standard drug discovery including SMILES parsing, standardization, descriptors, fingerprints, clustering, 3D conformers, parallel processing. Returns native rdkit.Chem.Mol objects. For advanced control or custom parameters, use rdkit directly.</description>
<location>global</location>
</skill>

<skill>
<name>deepchem</name>
<description>Molecular ML with diverse featurizers and pre-built datasets. Use for property prediction (ADMET, toxicity) with traditional ML or GNNs when you want extensive featurization options and MoleculeNet benchmarks. Best for quick experiments with pre-trained models, diverse molecular representations. For graph-first PyTorch workflows use torchdrug; for benchmark datasets use pytdc.</description>
<location>global</location>
</skill>

<skill>
<name>deeptools</name>
<description>NGS analysis toolkit. BAM to bigWig conversion, QC (correlation, PCA, fingerprints), heatmaps/profiles (TSS, peaks), for ChIP-seq, RNA-seq, ATAC-seq visualization.</description>
<location>global</location>
</skill>

<skill>
<name>defuddle</name>
<description>Extract clean markdown content from web pages using Defuddle CLI, removing clutter and navigation to save tokens. Use instead of WebFetch when the user provides a URL to read or analyze, for online documentation, articles, blog posts, or any standard web page.</description>
<location>global</location>
</skill>

<skill>
<name>delight</name>
<description>Add moments of joy, personality, and unexpected touches that make interfaces memorable and enjoyable to use. Elevates functional to delightful.</description>
<location>global</location>
</skill>

<skill>
<name>deserialization-testing</name>
<description>反序列化漏洞测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>design-motion-principles</name>
<description>Expert motion and interaction design auditor based on Emil Kowalski, Jakub Krehel, and Jhey Tompkins' techniques. Use when reviewing UI animations, transitions, hover states, or any motion design work. Provides per-designer perspectives with context-aware weighting.</description>
<location>global</location>
</skill>

<skill>
<name>detect_common_wetlab_errors</name>
<description>Detects common wet-lab procedural and safety errors from XR or fixed-camera lab video. Identifies pipette volume deviations, forgotten reagent additions, uncapped tubes, contamination risks, sample mix-ups, and other observable hazards. Outputs structured JSON with error type, timestamp, severity, and corrective action suggestions for real-time alerts or post-hoc audit.</description>
<location>global</location>
</skill>

<skill>
<name>diffdock</name>
<description>Diffusion-based molecular docking. Predict protein-ligand binding poses from PDB/SMILES, confidence scores, virtual screening, for structure-based drug design. Not for affinity prediction.</description>
<location>global</location>
</skill>

<skill>
<name>distill</name>
<description>Strip designs to their essence by removing unnecessary complexity. Great design is simple, powerful, and clean.</description>
<location>global</location>
</skill>

<skill>
<name>dnanexus-integration</name>
<description>DNAnexus cloud genomics platform. Build apps/applets, manage data (upload/download), dxpy Python SDK, run workflows, FASTQ/BAM/VCF, for genomics pipeline development and execution.</description>
<location>global</location>
</skill>

<skill>
<name>documentation</name>
<description>"Creates, structures, and reviews technical documentation following the Diátaxis framework (tutorials, how-to guides, reference, and explanation pages). Use when a user needs to write or reorganize docs, structure a tutorial vs. a how-to guide, build reference docs or API documentation, create explanation pages, choose between Diátaxis documentation types, or improve existing documentation structure. Trigger terms include: documentation structure, Diátaxis, tutorials vs how-to guides, organize docs, user guide, reference docs, technical writing."</description>
<location>global</location>
</skill>

<skill>
<name>docx</name>
<description>"Use this skill whenever the user wants to create, read, edit, or manipulate Word documents (.docx files). Triggers include: any mention of \"Word doc\", \"word document\", \".docx\", or requests to produce professional documents with formatting like tables of contents, headings, page numbers, or letterheads. Also use when extracting or reorganizing content from .docx files, inserting or replacing images in documents, performing find-and-replace in Word files, working with tracked changes or comments, or converting content into a polished Word document. If the user asks for a \"report\", \"memo\", \"letter\", \"template\", or similar deliverable as a Word or .docx file, use this skill. Do NOT use for PDFs, spreadsheets, Google Docs, or general coding tasks unrelated to document generation."</description>
<location>global</location>
</skill>

<skill>
<name>drug-discovery-search</name>
<description>End-to-end drug discovery platform combining ChEMBL compounds, DrugBank, targets, and FDA labels. Natural language powered by Valyu.</description>
<location>global</location>
</skill>

<skill>
<name>drug-labels-search</name>
<description>Search FDA drug labels with natural language queries. Official drug information, indications, and safety data via Valyu.</description>
<location>global</location>
</skill>

<skill>
<name>drugbank-database</name>
<description>Access and analyze comprehensive drug information from the DrugBank database including drug properties, interactions, targets, pathways, chemical structures, and pharmacology data. This skill should be used when working with pharmaceutical data, drug discovery research, pharmacology studies, drug-drug interaction analysis, target identification, chemical similarity searches, ADMET predictions, or any task requiring detailed drug and drug target information from DrugBank.</description>
<location>global</location>
</skill>

<skill>
<name>drugbank-search</name>
<description>Search DrugBank comprehensive drug database with natural language queries. Drug mechanisms, interactions, and safety data powered by Valyu.</description>
<location>global</location>
</skill>

<skill>
<name>egocentric_view_to_structured_log</name>
<description>Converts first-person XR headset video into a structured experiment timeline log. Extracts timestamped events (action, object, location, result) via VLM or action recognition, outputs Markdown or JSON for downstream analysis, reporting, protocol compliance audit, or ELN attachment.</description>
<location>global</location>
</skill>

<skill>
<name>egohos-segmentation</name>
<description>Egocentric Hand-Object Segmentation (EgoHOS) - pixel-level hand and object segmentation in egocentric videos. Outputs fine-grained segmentation masks with hand regions highlighted. Specialized for hand-object interaction scenarios with pixel-accurate masks. Ideal for detailed interaction analysis.</description>
<location>global</location>
</skill>

<skill>
<name>email-sequence</name>
<description>When the user wants to create or optimize an email sequence, drip campaign, automated email flow, or lifecycle email program. Also use when the user mentions "email sequence," "drip campaign," "nurture sequence," "onboarding emails," "welcome sequence," "re-engagement emails," "email automation," "lifecycle emails," "trigger-based emails," "email funnel," "email workflow," "what emails should I send," "welcome series," or "email cadence." Use this for any multi-email automated flow. For cold outreach emails, see cold-email. For in-app onboarding, see onboarding-cro.</description>
<location>global</location>
</skill>

<skill>
<name>ena-database</name>
<description>Access European Nucleotide Archive via API/FTP. Retrieve DNA/RNA sequences, raw reads (FASTQ), genome assemblies by accession, for genomics and bioinformatics pipelines. Supports multiple formats.</description>
<location>global</location>
</skill>

<skill>
<name>ensembl-database</name>
<description>Query Ensembl genome database REST API for 250+ species. Gene lookups, sequence retrieval, variant analysis, comparative genomics, orthologs, VEP predictions, for genomic research.</description>
<location>global</location>
</skill>

<skill>
<name>esm</name>
<description>Comprehensive toolkit for protein language models including ESM3 (generative multimodal protein design across sequence, structure, and function) and ESM C (efficient protein embeddings and representations). Use this skill when working with protein sequences, structures, or function prediction; designing novel proteins; generating protein embeddings; performing inverse folding; or conducting protein engineering tasks. Supports both local model usage and cloud-based Forge API for scalable inference.</description>
<location>global</location>
</skill>

<skill>
<name>etetoolkit</name>
<description>Phylogenetic tree toolkit (ETE). Tree manipulation (Newick/NHX), evolutionary event detection, orthology/paralogy, NCBI taxonomy, visualization (PDF/SVG), for phylogenomics.</description>
<location>global</location>
</skill>

<skill>
<name>exploratory-data-analysis</name>
<description>Perform comprehensive exploratory data analysis on scientific data files across 200+ file formats. This skill should be used when analyzing any scientific data file to understand its structure, content, quality, and characteristics. Automatically detects file type and generates detailed markdown reports with format-specific analysis, quality metrics, and downstream analysis recommendations. Covers chemistry, bioinformatics, microscopy, spectroscopy, proteomics, metabolomics, and general scientific data formats.</description>
<location>global</location>
</skill>

<skill>
<name>export_experiment_data_to_excel</name>
<description>Exports any structured experimental data (JSON, tables, time series) to well-formatted Excel (.xlsx) files. Auto-names sheets (Raw Data, Growth Curves, Cell Counts, etc.), adds unit headers and annotation rows, applies consistent styling, and produces lab-ready spreadsheets for sharing, archival, or downstream analysis in R, pandas, or Excel.</description>
<location>global</location>
</skill>

<skill>
<name>extract</name>
<description>Extract and consolidate reusable components, design tokens, and patterns into your design system. Identifies opportunities for systematic reuse and enriches your component library.</description>
<location>global</location>
</skill>

<skill>
<name>extract_experiment_data_from_video</name>
<description>General-purpose experimental data extractor from lab video streams. Ingests footage from XR headsets or fixed cameras and extracts typed, timestamped measurements — liquid volume levels, color/turbidity shifts, cell and colony counts, pipette readouts, instrument display values, gel band intensities — emitting a time-series JSON or CSV table ready for downstream analysis, charting, or ELN attachment.</description>
<location>global</location>
</skill>

<skill>
<name>fair-data</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>fastify-best-practices</name>
<description>"Guides development of Fastify Node.js backend servers and REST APIs using TypeScript or JavaScript. Use when building, configuring, or debugging a Fastify application — including defining routes, implementing plugins, setting up JSON Schema validation, handling errors, optimising performance, managing authentication, configuring CORS and security headers, integrating databases, working with WebSockets, and deploying to production. Covers the full Fastify request lifecycle (hooks, serialization, logging with Pino) and TypeScript integration via strip types. Trigger terms: Fastify, Node.js server, REST API, API routes, backend framework, fastify.config, server.ts, app.ts."</description>
<location>global</location>
</skill>

<skill>
<name>fda-database</name>
<description>Query openFDA API for drugs, devices, adverse events, recalls, regulatory submissions (510k, PMA), substance identification (UNII), for FDA regulatory data analysis and safety research.</description>
<location>global</location>
</skill>

<skill>
<name>file-upload-testing</name>
<description>文件上传漏洞测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>financial-deep-research</name>
<description>Conduct enterprise-grade financial research with multi-source synthesis, regulatory compliance tracking, verified market analysis, and forensic accounting investigation. Use when user needs comprehensive financial analysis requiring 10+ sources, verified claims, market comparisons, investment research, or forensic due diligence. Triggers include "financial research", "market analysis", "investment analysis", "due diligence", "financial deep dive", "compare stocks/funds", "analyze [company/sector]", "forensic accounting", "accounting fraud", "red flags", "SPV analysis", "revenue recognition", or "financial forensics". Do NOT use for simple stock quotes, basic company lookups, or questions answerable with 1-2 searches.</description>
<location>global</location>
</skill>

<skill>
<name>find-skills</name>
<description>Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.</description>
<location>global</location>
</skill>

<skill>
<name>flowio</name>
<description>Parse FCS (Flow Cytometry Standard) files v2.0-3.1. Extract events as NumPy arrays, read metadata/channels, convert to CSV/DataFrame, for flow cytometry data preprocessing.</description>
<location>global</location>
</skill>

<skill>
<name>form-cro</name>
<description>When the user wants to optimize any form that is NOT signup/registration — including lead capture forms, contact forms, demo request forms, application forms, survey forms, or checkout forms. Also use when the user mentions "form optimization," "lead form conversions," "form friction," "form fields," "form completion rate," "contact form," "nobody fills out our form," "form abandonment," "too many fields," "demo request form," or "lead form isn't converting." Use this for any non-signup form that captures information. For signup/registration forms, see signup-flow-cro. For popups containing forms, see popup-cro.</description>
<location>global</location>
</skill>

<skill>
<name>free-tool-strategy</name>
<description>When the user wants to plan, evaluate, or build a free tool for marketing purposes — lead generation, SEO value, or brand awareness. Also use when the user mentions "engineering as marketing," "free tool," "marketing tool," "calculator," "generator," "interactive tool," "lead gen tool," "build a tool for leads," "free resource," "ROI calculator," "grader tool," "audit tool," "should I build a free tool," or "tools for lead gen." Use this whenever someone wants to build something useful and give it away to attract leads or earn links. For content-based lead generation, see content-strategy.</description>
<location>global</location>
</skill>

<skill>
<name>frontend-design</name>
<description>Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications. Generates creative, polished code that avoids generic AI aesthetics.</description>
<location>global</location>
</skill>

<skill>
<name>gaussian_splatting_scene_description</name>
<description>Generates natural language scene descriptions from 3D Gaussian Splatting reconstructions built from lab photos or short video clips. Outputs structured text with instrument placement, sample positions, spatial layout keywords, and relational predicates — optimized for VLM or spatial intelligence model consumption in protocol guidance, error detection, or AR overlay generation.</description>
<location>global</location>
</skill>

<skill>
<name>gene-database</name>
<description>Query NCBI Gene via E-utilities/Datasets API. Search by symbol/ID, retrieve gene info (RefSeqs, GO, locations, phenotypes), batch lookups, for gene annotation and functional analysis.</description>
<location>global</location>
</skill>

<skill>
<name>generate_cell_analysis_charts</name>
<description>Domain-specialized chart generator for cell biology video analysis outputs. Consumes structured JSON from analyze_lab_video_cell_behavior or compatible sources and produces publication-ready figures — growth curves, cell trajectory maps, phenotype distribution charts, MSD plots, wound-closure timeseries, dose-response curves, and 96-well heatmaps — using matplotlib and seaborn. Exports PNG/PDF at configurable DPI for papers, ELN entries, or XR dashboards.</description>
<location>global</location>
</skill>

<skill>
<name>generate_double_column_pdf_report</name>
<description>Assembles experimental data, figures, methods, and results into a journal-style double-column PDF report. Uses reportlab or PyMuPDF for programmatic generation with title page, embedded figures/tables, section headings, body text flow, and reference placeholders — suitable for internal lab reports, preprint drafts, or journal submission-ready layouts.</description>
<location>global</location>
</skill>

<skill>
<name>generate_scientific_method_section</name>
<description>Automated SCI-standard Methods section generator from experiment execution records. Parses LabOS skill call chains, structured JSON logs (extract_experiment_data_from_video, analyze_lab_video_cell_behavior), protocol text, and ELN entries to produce flowing, past-tense, passive-voice Methods prose with full reagent citations, equipment model numbers, and statistical analysis subsections. Outputs LaTeX (\subsection{} / \paragraph{}) or Markdown, ready for direct insertion into a manuscript draft.</description>
<location>global</location>
</skill>

<skill>
<name>geniml</name>
<description>This skill should be used when working with genomic interval data (BED files) for machine learning tasks. Use for training region embeddings (Region2Vec, BEDspace), single-cell ATAC-seq analysis (scEmbed), building consensus peaks (universes), or any ML-based analysis of genomic regions. Applies to BED file collections, scATAC-seq data, chromatin accessibility datasets, and region-based genomic feature learning.</description>
<location>global</location>
</skill>

<skill>
<name>geo-database</name>
<description>Access NCBI GEO for gene expression/genomics data. Search/download microarray and RNA-seq datasets (GSE, GSM, GPL), retrieve SOFT/Matrix files, for transcriptomics and expression analysis.</description>
<location>global</location>
</skill>

<skill>
<name>geopandas</name>
<description>Python library for working with geospatial vector data including shapefiles, GeoJSON, and GeoPackage files. Use when working with geographic data for spatial analysis, geometric operations, coordinate transformations, spatial joins, overlay operations, choropleth mapping, or any task involving reading/writing/analyzing vector geographic data. Supports PostGIS databases, interactive maps, and integration with matplotlib/folium/cartopy. Use for tasks like buffer analysis, spatial joins between datasets, dissolving boundaries, clipping data, calculating areas/distances, reprojecting coordinate systems, creating maps, or converting between spatial file formats.</description>
<location>global</location>
</skill>

<skill>
<name>get-available-resources</name>
<description>This skill should be used at the start of any computationally intensive scientific task to detect and report available system resources (CPU cores, GPUs, memory, disk space). It creates a JSON file with resource information and strategic recommendations that inform computational approach decisions such as whether to use parallel processing (joblib, multiprocessing), out-of-core computing (Dask, Zarr), GPU acceleration (PyTorch, JAX), or memory-efficient strategies. Use this skill before running analyses, training models, processing large datasets, or any task where resource constraints matter.</description>
<location>global</location>
</skill>

<skill>
<name>gget</name>
<description>"Fast CLI/Python queries to 20+ bioinformatics databases. Use for quick lookups: gene info, BLAST searches, AlphaFold structures, enrichment analysis. Best for interactive exploration, simple queries. For batch processing or advanced BLAST use biopython; for multi-database Python workflows use bioservices."</description>
<location>global</location>
</skill>

<skill>
<name>ghidra</name>
<description>"Reverse engineer binaries using Ghidra's headless analyzer. Decompile executables, extract functions, strings, symbols, and analyze call graphs without GUI."</description>
<location>global</location>
</skill>

<skill>
<name>gtars</name>
<description>High-performance toolkit for genomic interval analysis in Rust with Python bindings. Use when working with genomic regions, BED files, coverage tracks, overlap detection, tokenization for ML models, or fragment analysis in computational genomics and machine learning applications.</description>
<location>global</location>
</skill>

<skill>
<name>gwas-database</name>
<description>Query NHGRI-EBI GWAS Catalog for SNP-trait associations. Search variants by rs ID, disease/trait, gene, retrieve p-values and summary statistics, for genetic epidemiology and polygenic risk scores.</description>
<location>global</location>
</skill>

<skill>
<name>hand-tracking-toolkit</name>
<description>Facebook Research Hand Tracking Challenge Toolkit - evaluation and visualization tools for 3D hand tracking. Supports loading HOT3D data, computing metrics (PA-MPJPE, AUC, etc.), visualizing 3D pose projections, and generating tracking evaluation reports. Essential for benchmarking hand tracking algorithms.</description>
<location>global</location>
</skill>

<skill>
<name>hands-3d-pose</name>
<description>High-quality 3D hand pose estimation for egocentric videos from ECCV 2024 (ap229997/hands). Provides 3D joint keypoints and skeleton visualization projected to 2D. Optimized for daily egocentric activities with state-of-the-art accuracy. Outputs hand skeleton overlays on video frames.</description>
<location>global</location>
</skill>

<skill>
<name>handtracking</name>
<description>Real-time hand detection in egocentric videos using victordibia/handtracking. Outputs bounding boxes for hands, specifically trained on EgoHands dataset. Supports video input/output with labeled hand boxes. Lightweight and fast for egocentric view applications.</description>
<location>global</location>
</skill>

<skill>
<name>harden</name>
<description>Improve interface resilience through better error handling, i18n support, text overflow handling, and edge case management. Makes interfaces robust and production-ready.</description>
<location>global</location>
</skill>

<skill>
<name>histolab</name>
<description>Lightweight WSI tile extraction and preprocessing. Use for basic slide processing tissue detection, tile extraction, stain normalization for H&E images. Best for simple pipelines, dataset preparation, quick tile-based analysis. For advanced spatial proteomics, multiplexed imaging, or deep learning pipelines use pathml.</description>
<location>global</location>
</skill>

<skill>
<name>hmdb-database</name>
<description>Access Human Metabolome Database (220K+ metabolites). Search by name/ID/structure, retrieve chemical properties, biomarker data, NMR/MS spectra, pathways, for metabolomics and identification.</description>
<location>global</location>
</skill>

<skill>
<name>hot3d</name>
<description>HOT3D (Hand-Object 3D Dataset) by Meta Facebook - multi-view egocentric hand and object 3D tracking for Aria/Quest smart glasses. State-of-the-art multi-view 3D hand pose, object pose, and hand-object interaction tracking. Supports visualization with 3D joint projections, meshes, and skeletal overlays on video frames.</description>
<location>global</location>
</skill>

<skill>
<name>http-api-cloudbase</name>
<description>Use CloudBase HTTP API to access CloudBase platform features (database, authentication, cloud functions, cloud hosting, cloud storage, AI) via HTTP protocol from backends or scripts that are not using SDKs.</description>
<location>global</location>
</skill>

<skill>
<name>hypogenic</name>
<description>Automated LLM-driven hypothesis generation and testing on tabular datasets. Use when you want to systematically explore hypotheses about patterns in empirical data (e.g., deception detection, content analysis). Combines literature insights with data-driven hypothesis testing. For manual hypothesis formulation use hypothesis-generation; for creative ideation use scientific-brainstorming.</description>
<location>global</location>
</skill>

<skill>
<name>hypothesis-generation</name>
<description>Structured hypothesis formulation from observations. Use when you have experimental observations or data and need to formulate testable hypotheses with predictions, propose mechanisms, and design experiments to test them. Follows scientific method framework. For open-ended ideation use scientific-brainstorming; for automated LLM-driven hypothesis testing on datasets use hypogenic.</description>
<location>global</location>
</skill>

<skill>
<name>icml-reviewer</name>
<description>|</description>
<location>global</location>
</skill>

<skill>
<name>idor-testing</name>
<description>IDOR不安全的直接对象引用测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>incident-response</name>
<description>安全事件响应的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>init</name>
<description>Creates, updates, or optimizes an AGENTS.md file for a repository with minimal, high-signal instructions covering non-discoverable coding conventions, tooling quirks, workflow preferences, and project-specific rules that agents cannot infer from reading the codebase. Use when setting up agent instructions or Claude configuration for a new repository, when an existing AGENTS.md is too long, generic, or stale, when agents repeatedly make avoidable mistakes, or when repository workflows have changed and the agent configuration needs pruning. Applies a discoverability filter—omitting anything Claude can learn from README, code, config, or directory structure—and a quality gate to verify each line remains accurate and operationally significant.</description>
<location>global</location>
</skill>

<skill>
<name>iso-13485-certification</name>
<description>Comprehensive toolkit for preparing ISO 13485 certification documentation for medical device Quality Management Systems. Use when users need help with ISO 13485 QMS documentation, including (1) conducting gap analysis of existing documentation, (2) creating Quality Manuals, (3) developing required procedures and work instructions, (4) preparing Medical Device Files, (5) understanding ISO 13485 requirements, or (6) identifying missing documentation for medical device certification. Also use when users mention medical device regulations, QMS certification, FDA QMSR, EU MDR, or need help with quality system documentation.</description>
<location>global</location>
</skill>

<skill>
<name>jadx</name>
<description>Android APK decompiler that converts DEX bytecode to readable Java source code. Use when you need to decompile APK files, analyze app logic, search for vulnerabilities, find hardcoded credentials, or understand app behavior through readable source code.</description>
<location>global</location>
</skill>

<skill>
<name>js-reverse-engineering</name>
<description>></description>
<location>global</location>
</skill>

<skill>
<name>json-canvas</name>
<description>Create and edit JSON Canvas files (.canvas) with nodes, edges, groups, and connections. Use when working with .canvas files, creating visual canvases, mind maps, flowcharts, or when the user mentions Canvas files in Obsidian.</description>
<location>global</location>
</skill>

<skill>
<name>kegg-database</name>
<description>Direct REST API access to KEGG (academic use only). Pathway analysis, gene-pathway mapping, metabolic pathways, drug interactions, ID conversion. For Python workflows with multiple databases, prefer bioservices. Use this for direct HTTP/REST work or KEGG-specific control.</description>
<location>global</location>
</skill>

<skill>
<name>labarchive-integration</name>
<description>Electronic lab notebook API integration. Access notebooks, manage entries/attachments, backup notebooks, integrate with Protocols.io/Jupyter/REDCap, for programmatic ELN workflows.</description>
<location>global</location>
</skill>

<skill>
<name>lamindb</name>
<description>This skill should be used when working with LaminDB, an open-source data framework for biology that makes data queryable, traceable, reproducible, and FAIR. Use when managing biological datasets (scRNA-seq, spatial, flow cytometry, etc.), tracking computational workflows, curating and validating data with biological ontologies, building data lakehouses, or ensuring data lineage and reproducibility in biological research. Covers data management, annotation, ontologies (genes, cell types, diseases, tissues), schema validation, integrations with workflow managers (Nextflow, Snakemake) and MLOps platforms (W&B, MLflow), and deployment strategies.</description>
<location>global</location>
</skill>

<skill>
<name>latchbio-integration</name>
<description>Latch platform for bioinformatics workflows. Build pipelines with Latch SDK, @workflow/@task decorators, deploy serverless workflows, LatchFile/LatchDir, Nextflow/Snakemake integration.</description>
<location>global</location>
</skill>

<skill>
<name>latex-posters</name>
<description>Create professional research posters in LaTeX using beamerposter, tikzposter, or baposter. Support for conference presentations, academic posters, and scientific communication. Includes layout design, color schemes, multi-column formats, figure integration, and poster-specific best practices for visual communication.</description>
<location>global</location>
</skill>

<skill>
<name>launch-strategy</name>
<description>"When the user wants to plan a product launch, feature announcement, or release strategy. Also use when the user mentions 'launch,' 'Product Hunt,' 'feature release,' 'announcement,' 'go-to-market,' 'beta launch,' 'early access,' 'waitlist,' 'product update,' 'how do I launch this,' 'launch checklist,' 'GTM plan,' or 'we're about to ship.' Use this whenever someone is preparing to release something publicly. For ongoing marketing after launch, see marketing-ideas."</description>
<location>global</location>
</skill>

<skill>
<name>ldap-injection-testing</name>
<description>LDAP注入漏洞测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>linting-neostandard-eslint9</name>
<description>Configures ESLint v9 flat config and neostandard for JavaScript and TypeScript projects, including migrating from legacy `.eslintrc*` files or the `standard` package. Use when you need to set up or fix linting with `eslint.config.js` or `eslint.config.mjs`, troubleshoot lint errors, configure neostandard rules, migrate from `.eslintrc` to flat config, or integrate linting into CI pipelines and pre-commit hooks.</description>
<location>global</location>
</skill>

<skill>
<name>literature</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>literature_to_hypothesis</name>
<description>Extracts falsifiable scientific hypotheses (if-then form) from multiple PubMed articles, abstracts, or full texts. Synthesizes supporting evidence, contradictions, and experimental validation suggestions into a structured Markdown report for hypothesis-driven research planning.</description>
<location>global</location>
</skill>

<skill>
<name>literature-review</name>
<description>Conduct comprehensive, systematic literature reviews using multiple academic databases (PubMed, arXiv, bioRxiv, Semantic Scholar, etc.). This skill should be used when conducting systematic literature reviews, meta-analyses, research synthesis, or comprehensive literature searches across biomedical, scientific, and technical domains. Creates professionally formatted markdown documents and PDFs with verified citations in multiple citation styles (APA, Nature, Vancouver, etc.).</description>
<location>global</location>
</skill>

<skill>
<name>literature-search</name>
<description>Comprehensive scientific literature search across PubMed, arXiv, bioRxiv, medRxiv. Natural language queries powered by Valyu semantic search.</description>
<location>global</location>
</skill>

<skill>
<name>lottie-miniprogram</name>
<description>Integrate and use Lottie animations in WeChat Mini Programs via lottie-miniprogram. Use this skill when adding Lottie/After Effects animations to mini program pages using canvas.</description>
<location>global</location>
</skill>

<skill>
<name>marketing-ideas</name>
<description>"When the user needs marketing ideas, inspiration, or strategies for their SaaS or software product. Also use when the user asks for 'marketing ideas,' 'growth ideas,' 'how to market,' 'marketing strategies,' 'marketing tactics,' 'ways to promote,' 'ideas to grow,' 'what else can I try,' 'I don't know how to market this,' 'brainstorm marketing,' or 'what marketing should I do.' Use this as a starting point whenever someone is stuck or looking for inspiration on how to grow. For specific channel execution, see the relevant skill (paid-ads, social-content, email-sequence, etc.)."</description>
<location>global</location>
</skill>

<skill>
<name>marketing-psychology</name>
<description>"When the user wants to apply psychological principles, mental models, or behavioral science to marketing. Also use when the user mentions 'psychology,' 'mental models,' 'cognitive bias,' 'persuasion,' 'behavioral science,' 'why people buy,' 'decision-making,' 'consumer behavior,' 'anchoring,' 'social proof,' 'scarcity,' 'loss aversion,' 'framing,' or 'nudge.' Use this whenever someone wants to understand or leverage how people think and make decisions in a marketing context."</description>
<location>global</location>
</skill>

<skill>
<name>markitdown</name>
<description>Convert files and office documents to Markdown. Supports PDF, DOCX, PPTX, XLSX, images (with OCR), audio (with transcription), HTML, CSV, JSON, XML, ZIP, YouTube URLs, EPubs and more.</description>
<location>global</location>
</skill>

<skill>
<name>matchms</name>
<description>Spectral similarity and compound identification for metabolomics. Use for comparing mass spectra, computing similarity scores (cosine, modified cosine), and identifying unknown compounds from spectral libraries. Best for metabolite identification, spectral matching, library searching. For full LC-MS/MS proteomics pipelines use pyopenms.</description>
<location>global</location>
</skill>

<skill>
<name>matlab</name>
<description>MATLAB and GNU Octave numerical computing for matrix operations, data analysis, visualization, and scientific computing. Use when writing MATLAB/Octave scripts for linear algebra, signal processing, image processing, differential equations, optimization, statistics, or creating scientific visualizations. Also use when the user needs help with MATLAB syntax, functions, or wants to convert between MATLAB and Python code. Scripts can be executed with MATLAB or the open-source GNU Octave interpreter.</description>
<location>global</location>
</skill>

<skill>
<name>matplotlib</name>
<description>Low-level plotting library for full customization. Use when you need fine-grained control over every plot element, creating novel plot types, or integrating with specific scientific workflows. Export to PNG/PDF/SVG for publication. For quick statistical plots use seaborn; for interactive plots use plotly; for publication-ready multi-panel figures with journal styling, use scientific-visualization.</description>
<location>global</location>
</skill>

<skill>
<name>medchem</name>
<description>Medicinal chemistry filters. Apply drug-likeness rules (Lipinski, Veber), PAINS filters, structural alerts, complexity metrics, for compound prioritization and library filtering.</description>
<location>global</location>
</skill>

<skill>
<name>medrxiv-search</name>
<description>Search medRxiv medical preprints with natural language queries. Powered by Valyu semantic search.</description>
<location>global</location>
</skill>

<skill>
<name>metabolomics-workbench-database</name>
<description>Access NIH Metabolomics Workbench via REST API (4,200+ studies). Query metabolites, RefMet nomenclature, MS/NMR data, m/z searches, study metadata, for metabolomics and biomarker discovery.</description>
<location>global</location>
</skill>

<skill>
<name>metasploit-framework</name>
<description>"This skill should be used when the user asks to \"use Metasploit for penetration testing\", \"exploit vulnerabilities with msfconsole\", \"create payloads with msfvenom\", \"perform post-exp..."</description>
<location>global</location>
</skill>

<skill>
<name>miniprogram-automation</name>
<description>Use when working with WeChat mini-program automation (小程序自动化、自动化测试、E2E) via miniprogram-automator, especially for standalone Node scripts or Jest tests involving DevTools launch/connect, page navigation, waitFor, custom-component selectors, wx method mocking, console or exception listeners, screenshots, regression checks, or troubleshooting launch failures, connection timeouts, and element-not-found issues.</description>
<location>global</location>
</skill>

<skill>
<name>miniprogram-ci</name>
<description>Use when the user wants to automate WeChat mini-program upload, preview, or npm packaging via CI/CD, generate deployment scripts, set up miniprogram-ci workflows, or create preview QR codes automatically. Trigger whenever the user mentions "上传小程序", "预览", "CI 部署", "miniprogram-ci", "自动化上传", "发布小程序版本", "生成预览二维码", "打包npm", "pack-npm", "构建npm依赖", "GitHub Actions 小程序", "pnpm 小程序部署", or asks to integrate WeChat mini-program with continuous integration pipelines (GitHub Actions, GitLab CI, etc.).</description>
<location>global</location>
</skill>

<skill>
<name>miniprogram-development</name>
<description>WeChat Mini Program development rules. Use this skill when developing WeChat mini programs, integrating CloudBase capabilities, and deploying mini program projects.</description>
<location>global</location>
</skill>

<skill>
<name>mobile-app-security-testing</name>
<description>移动应用安全测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>mobile-security</name>
<description>Reverses and exploits mobile applications. Use when working with Android APK files, iOS IPA files, mobile app reversing, Frida hooking, or app security analysis challenges.</description>
<location>global</location>
</skill>

<skill>
<name>molfeat</name>
<description>Molecular featurization for ML (100+ featurizers). ECFP, MACCS, descriptors, pretrained models (ChemBERTa), convert SMILES to features, for QSAR and molecular ML.</description>
<location>global</location>
</skill>

<skill>
<name>network-penetration-testing</name>
<description>网络渗透测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>networkx</name>
<description>Comprehensive toolkit for creating, analyzing, and visualizing complex networks and graphs in Python. Use when working with network/graph data structures, analyzing relationships between entities, computing graph algorithms (shortest paths, centrality, clustering), detecting communities, generating synthetic networks, or visualizing network topologies. Applicable to social networks, biological networks, transportation systems, citation networks, and any domain involving pairwise relationships.</description>
<location>global</location>
</skill>

<skill>
<name>neurokit2</name>
<description>Comprehensive biosignal processing toolkit for analyzing physiological data including ECG, EEG, EDA, RSP, PPG, EMG, and EOG signals. Use this skill when processing cardiovascular signals, brain activity, electrodermal responses, respiratory patterns, muscle activity, or eye movements. Applicable for heart rate variability analysis, event-related potentials, complexity measures, autonomic nervous system assessment, psychophysiology research, and multi-modal physiological signal integration.</description>
<location>global</location>
</skill>

<skill>
<name>neuropixels-analysis</name>
<description>Neuropixels neural recording analysis. Load SpikeGLX/OpenEphys data, preprocess, motion correction, Kilosort4 spike sorting, quality metrics, Allen/IBL curation, AI-assisted visual analysis, for Neuropixels 1.0/2.0 extracellular electrophysiology. Use when working with neural recordings, spike sorting, extracellular electrophysiology, or when the user mentions Neuropixels, SpikeGLX, Open Ephys, Kilosort, quality metrics, or unit curation.</description>
<location>global</location>
</skill>

<skill>
<name>next-best-practices</name>
<description>Next.js best practices - file conventions, RSC boundaries, data patterns, async APIs, metadata, error handling, route handlers, image/font optimization, bundling</description>
<location>global</location>
</skill>

<skill>
<name>nmap</name>
<description>Professional network reconnaissance and port scanning using nmap. Supports various scan types (quick, full, UDP, stealth), service detection, vulnerability scanning, and NSE scripts. Use when you need to enumerate network services, detect versions, or perform network reconnaissance.</description>
<location>global</location>
</skill>

<skill>
<name>node-best-practices</name>
<description>Provides domain-specific best practices for Node.js development with TypeScript, covering type stripping, async patterns, error handling, streams, modules, testing, performance, caching, logging, and more. Use when setting up Node.js projects with native TypeScript support, configuring type stripping (--experimental-strip-types), writing Node 22+ TypeScript without a build step, or when the user mentions 'native TypeScript in Node', 'strip types', 'Node 22 TypeScript', '.ts files without compilation', 'ts-node alternative', or needs guidance on error handling, graceful shutdown, flaky tests, profiling, or environment configuration in Node.js. Helps configure tsconfig.json for type stripping, set up package.json scripts, handle module resolution and import extensions, and apply robust patterns across the full Node.js stack.</description>
<location>global</location>
</skill>

<skill>
<name>nodejs-core</name>
<description>Debugs native module crashes, optimizes V8 performance, configures node-gyp builds, writes N-API/node-addon-api bindings, and diagnoses libuv event loop issues in Node.js. Use when working with C++ addons, native modules, binding.gyp, node-gyp errors, segfaults, memory leaks in native code, V8 optimization/deoptimization, libuv thread pool tuning, N-API or NAN bindings, build system failures, or any Node.js internals below the JavaScript layer.</description>
<location>global</location>
</skill>

<skill>
<name>normalize</name>
<description>Normalize design to match your design system and ensure consistency</description>
<location>global</location>
</skill>

<skill>
<name>oauth</name>
<description>Implements OAuth 2.0/2.1 authorization flows in Fastify applications — configures authorization code with PKCE, client credentials, device flow, refresh token rotation, JWT validation, and token introspection/revocation endpoints. Use when setting up authentication, authorization, login flows, access tokens, API security, or securing Fastify routes with OAuth; also applies when troubleshooting token validation errors, mismatched redirect URIs, CSRF issues, scope problems, or RFC 6749/6750/7636/8252/8628 compliance questions.</description>
<location>global</location>
</skill>

<skill>
<name>obsidian-bases</name>
<description>Create and edit Obsidian Bases (.base files) with views, filters, formulas, and summaries. Use when working with .base files, creating database-like views of notes, or when the user mentions Bases, table views, card views, filters, or formulas in Obsidian.</description>
<location>global</location>
</skill>

<skill>
<name>obsidian-cli</name>
<description>Interact with Obsidian vaults using the Obsidian CLI to read, create, search, and manage notes, tasks, properties, and more. Also supports plugin and theme development with commands to reload plugins, run JavaScript, capture errors, take screenshots, and inspect the DOM. Use when the user asks to interact with their Obsidian vault, manage notes, search vault content, perform vault operations from the command line, or develop and debug Obsidian plugins and themes.</description>
<location>global</location>
</skill>

<skill>
<name>obsidian-markdown</name>
<description>Create and edit Obsidian Flavored Markdown with wikilinks, embeds, callouts, properties, and other Obsidian-specific syntax. Use when working with .md files in Obsidian, or when the user mentions wikilinks, callouts, frontmatter, tags, embeds, or Obsidian notes.</description>
<location>global</location>
</skill>

<skill>
<name>octocat</name>
<description>Handles git and GitHub operations using the gh CLI. Use when the user asks about pull requests (PRs), GitHub issues, repo management, branching, merging, rebasing, cherry-picking, merge conflict resolution, commit history cleanup, pre-commit hook debugging, GitHub Actions workflows, or releases. Covers creating and reviewing PRs, watching CI checks, interactive rebasing, branch cleanup, submodule management, and repository archaeology with git log/blame/bisect.</description>
<location>global</location>
</skill>

<skill>
<name>omero-integration</name>
<description>Microscopy data management platform. Access images via Python, retrieve datasets, analyze pixels, manage ROIs/annotations, batch processing, for high-content screening and microscopy workflows.</description>
<location>global</location>
</skill>

<skill>
<name>onboard</name>
<description>Design or improve onboarding flows, empty states, and first-time user experiences. Helps users get started successfully and understand value quickly.</description>
<location>global</location>
</skill>

<skill>
<name>onboarding-cro</name>
<description>When the user wants to optimize post-signup onboarding, user activation, first-run experience, or time-to-value. Also use when the user mentions "onboarding flow," "activation rate," "user activation," "first-run experience," "empty states," "onboarding checklist," "aha moment," "new user experience," "users aren't activating," "nobody completes setup," "low activation rate," "users sign up but don't use the product," "time to value," or "first session experience." Use this whenever users are signing up but not sticking around. For signup/registration optimization, see signup-flow-cro. For ongoing email sequences, see email-sequence.</description>
<location>global</location>
</skill>

<skill>
<name>open-targets-search</name>
<description>Search Open Targets drug-disease associations with natural language queries. Target validation powered by Valyu semantic search.</description>
<location>global</location>
</skill>

<skill>
<name>openalex-database</name>
<description>Query and analyze scholarly literature using the OpenAlex database. This skill should be used when searching for academic papers, analyzing research trends, finding works by authors or institutions, tracking citations, discovering open access publications, or conducting bibliometric analysis across 240M+ scholarly works. Use for literature searches, research output analysis, citation analysis, and academic database queries.</description>
<location>global</location>
</skill>

<skill>
<name>opentargets-database</name>
<description>Query Open Targets Platform for target-disease associations, drug target discovery, tractability/safety data, genetics/omics evidence, known drugs, for therapeutic target identification.</description>
<location>global</location>
</skill>

<skill>
<name>opentrons-integration</name>
<description>Official Opentrons Protocol API for OT-2 and Flex robots. Use when writing protocols specifically for Opentrons hardware with full access to Protocol API v2 features. Best for production Opentrons protocols, official API compatibility. For multi-vendor automation or broader equipment control use pylabrobot.</description>
<location>global</location>
</skill>

<skill>
<name>optimize</name>
<description>Improve interface performance across loading speed, rendering, animations, images, and bundle size. Makes experiences faster and smoother.</description>
<location>global</location>
</skill>

<skill>
<name>osint</name>
<description>Gathers intelligence from public sources. Use when searching for usernames, geolocating images, investigating social media, analyzing domains, or solving information gathering challenges.</description>
<location>global</location>
</skill>

<skill>
<name>page-cro</name>
<description>When the user wants to optimize, improve, or increase conversions on any marketing page — including homepage, landing pages, pricing pages, feature pages, or blog posts. Also use when the user says "CRO," "conversion rate optimization," "this page isn't converting," "improve conversions," "why isn't this page working," "my landing page sucks," "nobody's converting," "low conversion rate," "bounce rate is too high," "people leave without signing up," or "this page needs work." Use this even if the user just shares a URL and asks for feedback — they probably want conversion help. For signup/registration flows, see signup-flow-cro. For post-signup activation, see onboarding-cro. For forms outside of signup, see form-cro. For popups/modals, see popup-cro.</description>
<location>global</location>
</skill>

<skill>
<name>paid-ads</name>
<description>"When the user wants help with paid advertising campaigns on Google Ads, Meta (Facebook/Instagram), LinkedIn, Twitter/X, or other ad platforms. Also use when the user mentions 'PPC,' 'paid media,' 'ROAS,' 'CPA,' 'ad campaign,' 'retargeting,' 'audience targeting,' 'Google Ads,' 'Facebook ads,' 'LinkedIn ads,' 'ad budget,' 'cost per click,' 'ad spend,' or 'should I run ads.' Use this for campaign strategy, audience targeting, bidding, and optimization. For bulk ad creative generation and iteration, see ad-creative. For landing page optimization, see page-cro."</description>
<location>global</location>
</skill>

<skill>
<name>paper-writing</name>
<description>Expert guidance for writing high-quality academic and research papers. Use when the user wants to write, structure, revise, or improve academic papers, research articles, conference papers, or technical reports. Provides comprehensive support for all stages from planning to final polish.</description>
<location>global</location>
</skill>

<skill>
<name>patent-drafting</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>patents-search</name>
<description>Search global patents with natural language queries. Prior art, patent landscapes, and innovation tracking via Valyu.</description>
<location>global</location>
</skill>

<skill>
<name>pathml</name>
<description>Full-featured computational pathology toolkit. Use for advanced WSI analysis including multiplexed immunofluorescence (CODEX, Vectra), nucleus segmentation, tissue graph construction, and ML model training on pathology data. Supports 160+ slide formats. For simple tile extraction from H&E slides, histolab may be simpler.</description>
<location>global</location>
</skill>

<skill>
<name>paywall-upgrade-cro</name>
<description>When the user wants to create or optimize in-app paywalls, upgrade screens, upsell modals, or feature gates. Also use when the user mentions "paywall," "upgrade screen," "upgrade modal," "upsell," "feature gate," "convert free to paid," "freemium conversion," "trial expiration screen," "limit reached screen," "plan upgrade prompt," "in-app pricing," "free users won't upgrade," "trial to paid conversion," or "how do I get users to pay." Use this for any in-product moment where you're asking users to upgrade. Distinct from public pricing pages (see page-cro) — this focuses on in-product upgrade moments where the user has already experienced value. For pricing decisions, see pricing-strategy.</description>
<location>global</location>
</skill>

<skill>
<name>pdb-database</name>
<description>Access RCSB PDB for 3D protein/nucleic acid structures. Search by text/sequence/structure, download coordinates (PDB/mmCIF), retrieve metadata, for structural biology and drug discovery.</description>
<location>global</location>
</skill>

<skill>
<name>peer-review</name>
<description>Structured manuscript/grant review with checklist-based evaluation. Use when writing formal peer reviews with specific criteria methodology assessment, statistical validity, reporting standards compliance (CONSORT/STROBE), and constructive feedback. Best for actual review writing, manuscript revision. For evaluating claims/evidence quality use scientific-critical-thinking; for quantitative scoring frameworks use scholar-evaluation.</description>
<location>global</location>
</skill>

<skill>
<name>pentest-osint-recon</name>
<description>Open Source Intelligence gathering and attack surface management for external reconnaissance.</description>
<location>global</location>
</skill>

<skill>
<name>perplexity-search</name>
<description>Perform AI-powered web searches with real-time information using Perplexity models via LiteLLM and OpenRouter. This skill should be used when conducting web searches for current information, finding recent scientific literature, getting grounded answers with source citations, or accessing information beyond the model knowledge cutoff. Provides access to multiple Perplexity models including Sonar Pro, Sonar Pro Search (advanced agentic search), and Sonar Reasoning Pro through a single OpenRouter API key.</description>
<location>global</location>
</skill>

<skill>
<name>plotly</name>
<description>Interactive visualization library. Use when you need hover info, zoom, pan, or web-embeddable charts. Best for dashboards, exploratory analysis, and presentations. For static publication figures use matplotlib or scientific-visualization.</description>
<location>global</location>
</skill>

<skill>
<name>polars</name>
<description>Fast in-memory DataFrame library for datasets that fit in RAM. Use when pandas is too slow but data still fits in memory. Lazy evaluation, parallel execution, Apache Arrow backend. Best for 1-100GB datasets, ETL pipelines, faster pandas replacement. For larger-than-RAM data use dask or vaex.</description>
<location>global</location>
</skill>

<skill>
<name>polish</name>
<description>Final quality pass before shipping. Fixes alignment, spacing, consistency, and detail issues that separate good from great.</description>
<location>global</location>
</skill>

<skill>
<name>popup-cro</name>
<description>When the user wants to create or optimize popups, modals, overlays, slide-ins, or banners for conversion purposes. Also use when the user mentions "exit intent," "popup conversions," "modal optimization," "lead capture popup," "email popup," "announcement banner," "overlay," "collect emails with a popup," "exit popup," "scroll trigger," "sticky bar," or "notification bar." Use this for any overlay or interrupt-style conversion element. For forms outside of popups, see form-cro. For general page conversion optimization, see page-cro.</description>
<location>global</location>
</skill>

<skill>
<name>pptx-generation</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>pptx-posters</name>
<description>Create research posters using HTML/CSS that can be exported to PDF or PPTX. Use this skill ONLY when the user explicitly requests PowerPoint/PPTX poster format. For standard research posters, use latex-posters instead. This skill provides modern web-based poster design with responsive layouts and easy visual integration.</description>
<location>global</location>
</skill>

<skill>
<name>pricing-strategy</name>
<description>"When the user wants help with pricing decisions, packaging, or monetization strategy. Also use when the user mentions 'pricing,' 'pricing tiers,' 'freemium,' 'free trial,' 'packaging,' 'price increase,' 'value metric,' 'Van Westendorp,' 'willingness to pay,' 'monetization,' 'how much should I charge,' 'my pricing is wrong,' 'pricing page,' 'annual vs monthly,' 'per seat pricing,' or 'should I offer a free plan.' Use this whenever someone is figuring out what to charge or how to structure their plans. For in-app upgrade screens, see paywall-upgrade-cro."</description>
<location>global</location>
</skill>

<skill>
<name>privilege-escalation-methods</name>
<description>"This skill should be used when the user asks to \"escalate privileges\", \"get root access\", \"become administrator\", \"privesc techniques\", \"abuse sudo\", \"exploit SUID binaries\", \"K..."</description>
<location>global</location>
</skill>

<skill>
<name>product-marketing-context</name>
<description>"When the user wants to create or update their product marketing context document. Also use when the user mentions 'product context,' 'marketing context,' 'set up context,' 'positioning,' 'who is my target audience,' 'describe my product,' 'ICP,' 'ideal customer profile,' or wants to avoid repeating foundational information across marketing tasks. Use this at the start of any new project before using other marketing skills — it creates `.agents/product-marketing-context.md` that all other skills reference for product, audience, and positioning context."</description>
<location>global</location>
</skill>

<skill>
<name>programmatic-seo</name>
<description>When the user wants to create SEO-driven pages at scale using templates and data. Also use when the user mentions "programmatic SEO," "template pages," "pages at scale," "directory pages," "location pages," "[keyword] + [city] pages," "comparison pages," "integration pages," "building many pages for SEO," "pSEO," "generate 100 pages," "data-driven pages," or "templated landing pages." Use this whenever someone wants to create many similar pages targeting different keywords or locations. For auditing existing SEO issues, see seo-audit. For content strategy planning, see content-strategy.</description>
<location>global</location>
</skill>

<skill>
<name>protocol_video_matching</name>
<description>Real-time XR video vs. protocol text matching and deviation detection. Aligns first-person XR headset video streams frame-by-frame against structured protocol steps, flags procedural deviations, scores compliance, and delivers corrective audio/visual overlays — enabling one-person lab operation with zero-missed-step guarantees.</description>
<location>global</location>
</skill>

<skill>
<name>protocol-reverse-engineering</name>
<description>Master network protocol reverse engineering including packet analysis, protocol dissection, and custom protocol documentation. Use when analyzing network traffic, understanding proprietary protocols, or debugging network communication.</description>
<location>global</location>
</skill>

<skill>
<name>protocol-writing</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>protocolsio-integration</name>
<description>Integration with protocols.io API for managing scientific protocols. This skill should be used when working with protocols.io to search, create, update, or publish protocols; manage protocol steps and materials; handle discussions and comments; organize workspaces; upload and manage files; or integrate protocols.io functionality into workflows. Applicable for protocol discovery, collaborative protocol development, experiment tracking, lab protocol management, and scientific documentation.</description>
<location>global</location>
</skill>

<skill>
<name>pubchem-database</name>
<description>Query PubChem via PUG-REST API/PubChemPy (110M+ compounds). Search by name/CID/SMILES, retrieve properties, similarity/substructure searches, bioactivity, for cheminformatics.</description>
<location>global</location>
</skill>

<skill>
<name>pubmed-database</name>
<description>Direct REST API access to PubMed. Advanced Boolean/MeSH queries, E-utilities API, batch processing, citation management. For Python workflows, prefer biopython (Bio.Entrez). Use this for direct HTTP/REST work or custom API implementations.</description>
<location>global</location>
</skill>

<skill>
<name>pubmed-search</name>
<description>Search PubMed biomedical literature with natural language queries powered by Valyu semantic search. Full-text access, integrate into your AI projects.</description>
<location>global</location>
</skill>

<skill>
<name>pydeseq2</name>
<description>Differential gene expression analysis (Python DESeq2). Identify DE genes from bulk RNA-seq counts, Wald tests, FDR correction, volcano/MA plots, for RNA-seq analysis.</description>
<location>global</location>
</skill>

<skill>
<name>pydicom</name>
<description>Python library for working with DICOM (Digital Imaging and Communications in Medicine) files. Use this skill when reading, writing, or modifying medical imaging data in DICOM format, extracting pixel data from medical images (CT, MRI, X-ray, ultrasound), anonymizing DICOM files, working with DICOM metadata and tags, converting DICOM images to other formats, handling compressed DICOM data, or processing medical imaging datasets. Applies to tasks involving medical image analysis, PACS systems, radiology workflows, and healthcare imaging applications.</description>
<location>global</location>
</skill>

<skill>
<name>pyhealth</name>
<description>Comprehensive healthcare AI toolkit for developing, testing, and deploying machine learning models with clinical data. This skill should be used when working with electronic health records (EHR), clinical prediction tasks (mortality, readmission, drug recommendation), medical coding systems (ICD, NDC, ATC), physiological signals (EEG, ECG), healthcare datasets (MIMIC-III/IV, eICU, OMOP), or implementing deep learning models for healthcare applications (RETAIN, SafeDrug, Transformer, GNN).</description>
<location>global</location>
</skill>

<skill>
<name>pylabrobot</name>
<description>Vendor-agnostic lab automation framework. Use when controlling multiple equipment types (Hamilton, Tecan, Opentrons, plate readers, pumps) or needing unified programming across different vendors. Best for complex workflows, multi-vendor setups, simulation. For Opentrons-only protocols with official API, opentrons-integration may be simpler.</description>
<location>global</location>
</skill>

<skill>
<name>pymc</name>
<description>Bayesian modeling with PyMC. Build hierarchical models, MCMC (NUTS), variational inference, LOO/WAIC comparison, posterior checks, for probabilistic programming and inference.</description>
<location>global</location>
</skill>

<skill>
<name>pymoo</name>
<description>Multi-objective optimization framework. NSGA-II, NSGA-III, MOEA/D, Pareto fronts, constraint handling, benchmarks (ZDT, DTLZ), for engineering design and optimization problems.</description>
<location>global</location>
</skill>

<skill>
<name>pyopenms</name>
<description>Complete mass spectrometry analysis platform. Use for proteomics workflows feature detection, peptide identification, protein quantification, and complex LC-MS/MS pipelines. Supports extensive file formats and algorithms. Best for proteomics, comprehensive MS data processing. For simple spectral comparison and metabolite ID use matchms.</description>
<location>global</location>
</skill>

<skill>
<name>pysam</name>
<description>Genomic file toolkit. Read/write SAM/BAM/CRAM alignments, VCF/BCF variants, FASTA/FASTQ sequences, extract regions, calculate coverage, for NGS data processing pipelines.</description>
<location>global</location>
</skill>

<skill>
<name>pytdc</name>
<description>Therapeutics Data Commons. AI-ready drug discovery datasets (ADME, toxicity, DTI), benchmarks, scaffold splits, molecular oracles, for therapeutic ML and pharmacological prediction.</description>
<location>global</location>
</skill>

<skill>
<name>pytorch-lightning</name>
<description>Deep learning framework (PyTorch Lightning). Organize PyTorch code into LightningModules, configure Trainers for multi-GPU/TPU, implement data pipelines, callbacks, logging (W&B, TensorBoard), distributed training (DDP, FSDP, DeepSpeed), for scalable neural network training.</description>
<location>global</location>
</skill>

<skill>
<name>quieter</name>
<description>Tone down overly bold or visually aggressive designs. Reduces intensity while maintaining design quality and impact.</description>
<location>global</location>
</skill>

<skill>
<name>rdkit</name>
<description>Cheminformatics toolkit for fine-grained molecular control. SMILES/SDF parsing, descriptors (MW, LogP, TPSA), fingerprints, substructure search, 2D/3D generation, similarity, reactions. For standard workflows with simpler interface, use datamol (wrapper around RDKit). Use rdkit for advanced control, custom sanitization, specialized algorithms.</description>
<location>global</location>
</skill>

<skill>
<name>reactome-database</name>
<description>Query Reactome REST API for pathway analysis, enrichment, gene-pathway mapping, disease pathways, molecular interactions, expression analysis, for systems biology studies.</description>
<location>global</location>
</skill>

<skill>
<name>realtime_protocol_guidance_prompts</name>
<description>Generates short, imperative guidance prompts for the next experimental step from current video frame and protocol context. Output is optimized for voice broadcast (TTS) or AR overlay — concise, actionable, command-style — to guide researchers in real time, correct deviations, or resume experiments without breaking flow.</description>
<location>global</location>
</skill>

<skill>
<name>recall</name>
<description>></description>
<location>global</location>
</skill>

<skill>
<name>red-team-tools</name>
<description>"This skill should be used when the user asks to \"follow red team methodology\", \"perform bug bounty hunting\", \"automate reconnaissance\", \"hunt for XSS vulnerabilities\", \"enumerate su..."</description>
<location>global</location>
</skill>

<skill>
<name>referral-program</name>
<description>"When the user wants to create, optimize, or analyze a referral program, affiliate program, or word-of-mouth strategy. Also use when the user mentions 'referral,' 'affiliate,' 'ambassador,' 'word of mouth,' 'viral loop,' 'refer a friend,' 'partner program,' 'referral incentive,' 'how to get referrals,' 'customers referring customers,' or 'affiliate payout.' Use this whenever someone wants existing users or partners to bring in new customers. For launch-specific virality, see launch-strategy."</description>
<location>global</location>
</skill>

<skill>
<name>regulatory-submission</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>relational-database-mcp-cloudbase</name>
<description>This is the required documentation for agents operating on the CloudBase Relational Database. It lists the only four supported tools for running SQL and managing security rules. Read the full content to understand why you must NOT use standard Application SDKs and how to safely execute INSERT, UPDATE, or DELETE operations without corrupting production data.</description>
<location>global</location>
</skill>

<skill>
<name>relational-database-web-cloudbase</name>
<description>Use when building frontend Web apps that talk to CloudBase Relational Database via @cloudbase/js-sdk – provides the canonical init pattern so you can then use Supabase-style queries from the browser.</description>
<location>global</location>
</skill>

<skill>
<name>reproducibility-checklist</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>research-grants</name>
<description>Write competitive research proposals for NSF, NIH, DOE, DARPA, and Taiwan NSTC. Agency-specific formatting, review criteria, budget preparation, broader impacts, significance statements, innovation narratives, and compliance with submission requirements.</description>
<location>global</location>
</skill>

<skill>
<name>research-lookup</name>
<description>Look up current research information using Perplexity Sonar Pro Search or Sonar Reasoning Pro models through OpenRouter. Automatically selects the best model based on query complexity. Search academic papers, recent studies, technical documentation, and general research information with citations.</description>
<location>global</location>
</skill>

<skill>
<name>review-writing</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>revops</name>
<description>"When the user wants help with revenue operations, lead lifecycle management, or marketing-to-sales handoff processes. Also use when the user mentions 'RevOps,' 'revenue operations,' 'lead scoring,' 'lead routing,' 'MQL,' 'SQL,' 'pipeline stages,' 'deal desk,' 'CRM automation,' 'marketing-to-sales handoff,' 'data hygiene,' 'leads aren't getting to sales,' 'pipeline management,' 'lead qualification,' or 'when should marketing hand off to sales.' Use this for anything involving the systems and processes that connect marketing to revenue. For cold outreach emails, see cold-email. For email drip campaigns, see email-sequence. For pricing decisions, see pricing-strategy."</description>
<location>global</location>
</skill>

<skill>
<name>robot_protocol_step_generator</name>
<description>Converts natural language or PDF protocol text into executable step sequences for Opentrons or PyLabRobot. Parses protocol descriptions to extract pipette volumes, well positions, temperatures, incubation times, and transfer patterns; outputs Python code snippets or JSON instruction lists ready for robot execution or simulation.</description>
<location>global</location>
</skill>

<skill>
<name>rowan</name>
<description>Cloud-based quantum chemistry platform with Python API. Preferred for computational chemistry workflows including pKa prediction, geometry optimization, conformer searching, molecular property calculations, protein-ligand docking (AutoDock Vina), and AI protein cofolding (Chai-1, Boltz-1/2). Use when tasks involve quantum chemistry calculations, molecular property prediction, DFT or semiempirical methods, neural network potentials (AIMNet2), protein-ligand binding predictions, or automated computational chemistry pipelines. Provides cloud compute resources with no local setup required.</description>
<location>global</location>
</skill>

<skill>
<name>sales-enablement</name>
<description>"When the user wants to create sales collateral, pitch decks, one-pagers, objection handling docs, or demo scripts. Also use when the user mentions 'sales deck,' 'pitch deck,' 'one-pager,' 'leave-behind,' 'objection handling,' 'deal-specific ROI analysis,' 'demo script,' 'talk track,' 'sales playbook,' 'proposal template,' 'buyer persona card,' 'help my sales team,' 'sales materials,' or 'what should I give my sales reps.' Use this for any document or asset that helps a sales team close deals. For competitor comparison pages and battle cards, see competitor-alternatives. For marketing website copy, see copywriting. For cold outreach emails, see cold-email."</description>
<location>global</location>
</skill>

<skill>
<name>scanpy</name>
<description>Standard single-cell RNA-seq analysis pipeline. Use for QC, normalization, dimensionality reduction (PCA/UMAP/t-SNE), clustering, differential expression, and visualization. Best for exploratory scRNA-seq analysis with established workflows. For deep learning models use scvi-tools; for data format questions use anndata.</description>
<location>global</location>
</skill>

<skill>
<name>schema-markup</name>
<description>When the user wants to add, fix, or optimize schema markup and structured data on their site. Also use when the user mentions "schema markup," "structured data," "JSON-LD," "rich snippets," "schema.org," "FAQ schema," "product schema," "review schema," "breadcrumb schema," "Google rich results," "knowledge panel," "star ratings in search," or "add structured data." Use this whenever someone wants their pages to show enhanced results in Google. For broader SEO issues, see seo-audit. For AI search optimization, see ai-seo.</description>
<location>global</location>
</skill>

<skill>
<name>scholar-evaluation</name>
<description>Systematically evaluate scholarly work using the ScholarEval framework, providing structured assessment across research quality dimensions including problem formulation, methodology, analysis, and writing with quantitative scoring and actionable feedback.</description>
<location>global</location>
</skill>

<skill>
<name>science-communication</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>scientific-brainstorming</name>
<description>Creative research ideation and exploration. Use for open-ended brainstorming sessions, exploring interdisciplinary connections, challenging assumptions, or identifying research gaps. Best for early-stage research planning when you do not have specific observations yet. For formulating testable hypotheses from data use hypothesis-generation.</description>
<location>global</location>
</skill>

<skill>
<name>scientific-critical-thinking</name>
<description>Evaluate scientific claims and evidence quality. Use for assessing experimental design validity, identifying biases and confounders, applying evidence grading frameworks (GRADE, Cochrane Risk of Bias), or teaching critical analysis. Best for understanding evidence quality, identifying flaws. For formal peer review writing use peer-review.</description>
<location>global</location>
</skill>

<skill>
<name>scientific-diagram-generation</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>scientific-manuscript-review</name>
<description>Use when reviewing or editing research manuscripts, journal articles, reviews, or perspectives. Invoke when user mentions manuscript, paper draft, article, research writing, journal submission, reviewer feedback, or needs to improve scientific writing clarity, structure, or argumentation in their manuscript.</description>
<location>global</location>
</skill>

<skill>
<name>scientific-slides</name>
<description>Build slide decks and presentations for research talks. Use this for making PowerPoint slides, conference presentations, seminar talks, research presentations, thesis defense slides, or any scientific talk. Provides slide structure, design templates, timing guidance, and visual validation. Works with PowerPoint and LaTeX Beamer.</description>
<location>global</location>
</skill>

<skill>
<name>scientific-visualization</name>
<description>Meta-skill for publication-ready figures. Use when creating journal submission figures requiring multi-panel layouts, significance annotations, error bars, colorblind-safe palettes, and specific journal formatting (Nature, Science, Cell). Orchestrates matplotlib/seaborn/plotly with publication styles. For quick exploration use seaborn or plotly directly.</description>
<location>global</location>
</skill>

<skill>
<name>scientific-writing</name>
<description>Core skill for the deep research and writing tool. Write scientific manuscripts in full paragraphs (never bullet points). Use two-stage process with (1) section outlines with key points using research-lookup then (2) convert to flowing prose. IMRAD structure, citations (APA/AMA/Vancouver), figures/tables, reporting guidelines (CONSORT/STROBE/PRISMA), for research papers and journal submissions.</description>
<location>global</location>
</skill>

<skill>
<name>scikit-bio</name>
<description>Biological data toolkit. Sequence analysis, alignments, phylogenetic trees, diversity metrics (alpha/beta, UniFrac), ordination (PCoA), PERMANOVA, FASTA/Newick I/O, for microbiome analysis.</description>
<location>global</location>
</skill>

<skill>
<name>scikit-learn</name>
<description>Machine learning in Python with scikit-learn. Use when working with supervised learning (classification, regression), unsupervised learning (clustering, dimensionality reduction), model evaluation, hyperparameter tuning, preprocessing, or building ML pipelines. Provides comprehensive reference documentation for algorithms, preprocessing techniques, pipelines, and best practices.</description>
<location>global</location>
</skill>

<skill>
<name>scikit-survival</name>
<description>Comprehensive toolkit for survival analysis and time-to-event modeling in Python using scikit-survival. Use this skill when working with censored survival data, performing time-to-event analysis, fitting Cox models, Random Survival Forests, Gradient Boosting models, or Survival SVMs, evaluating survival predictions with concordance index or Brier score, handling competing risks, or implementing any survival analysis workflow with the scikit-survival library.</description>
<location>global</location>
</skill>

<skill>
<name>scvi-tools</name>
<description>Deep generative models for single-cell omics. Use when you need probabilistic batch correction (scVI), transfer learning, differential expression with uncertainty, or multi-modal integration (TOTALVI, MultiVI). Best for advanced modeling, batch effects, multimodal data. For standard analysis pipelines use scanpy.</description>
<location>global</location>
</skill>

<skill>
<name>seaborn</name>
<description>Statistical visualization with pandas integration. Use for quick exploration of distributions, relationships, and categorical comparisons with attractive defaults. Best for box plots, violin plots, pair plots, heatmaps. Built on matplotlib. For interactive plots use plotly; for publication styling use scientific-visualization.</description>
<location>global</location>
</skill>

<skill>
<name>secure-code-review</name>
<description>安全代码审查的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>security-automation</name>
<description>安全自动化的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>security-awareness-training</name>
<description>安全意识培训的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>seo-audit</name>
<description>When the user wants to audit, review, or diagnose SEO issues on their site. Also use when the user mentions "SEO audit," "technical SEO," "why am I not ranking," "SEO issues," "on-page SEO," "meta tags review," "SEO health check," "my traffic dropped," "lost rankings," "not showing up in Google," "site isn't ranking," "Google update hit me," "page speed," "core web vitals," "crawl errors," or "indexing issues." Use this even if the user just says something vague like "my SEO is bad" or "help with SEO" — start with an audit. For building pages at scale to target keywords, see programmatic-seo. For adding structured data, see schema-markup. For AI search optimization, see ai-seo.</description>
<location>global</location>
</skill>

<skill>
<name>shadcn</name>
<description>Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI. Provides project context, component docs, and usage examples. Applies when working with shadcn/ui, component registries, presets, --preset codes, or any project with a components.json file. Also triggers for "shadcn init", "create an app with --preset", or "switch to --preset".</description>
<location>global</location>
</skill>

<skill>
<name>shap</name>
<description>Model interpretability and explainability using SHAP (SHapley Additive exPlanations). Use this skill when explaining machine learning model predictions, computing feature importance, generating SHAP plots (waterfall, beeswarm, bar, scatter, force, heatmap), debugging models, analyzing model bias or fairness, comparing models, or implementing explainable AI. Works with tree-based models (XGBoost, LightGBM, Random Forest), deep learning (TensorFlow, PyTorch), linear models, and any black-box model.</description>
<location>global</location>
</skill>

<skill>
<name>signup-flow-cro</name>
<description>When the user wants to optimize signup, registration, account creation, or trial activation flows. Also use when the user mentions "signup conversions," "registration friction," "signup form optimization," "free trial signup," "reduce signup dropoff," "account creation flow," "people aren't signing up," "signup abandonment," "trial conversion rate," "nobody completes registration," "too many steps to sign up," or "simplify our signup." Use this whenever the user has a signup or registration flow that isn't performing. For post-signup onboarding, see onboarding-cro. For lead capture forms (not account creation), see form-cro.</description>
<location>global</location>
</skill>

<skill>
<name>site-architecture</name>
<description>When the user wants to plan, map, or restructure their website's page hierarchy, navigation, URL structure, or internal linking. Also use when the user mentions "sitemap," "site map," "visual sitemap," "site structure," "page hierarchy," "information architecture," "IA," "navigation design," "URL structure," "breadcrumbs," "internal linking strategy," "website planning," "what pages do I need," "how should I organize my site," or "site navigation." Use this whenever someone is planning what pages a website should have and how they connect. NOT for XML sitemaps (that's technical SEO — see seo-audit). For SEO audits, see seo-audit. For structured data, see schema-markup.</description>
<location>global</location>
</skill>

<skill>
<name>skill-creator</name>
<description>Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, update or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy.</description>
<location>global</location>
</skill>

<skill>
<name>snipgrapher</name>
<description>Configures and uses snipgrapher to generate polished code snippet images, including syntax-highlighted PNGs, SVGs, and WebP exports with custom themes, profiles, and styling options. Use when the user wants to create code screenshots, turn code into shareable images, generate pretty code snippets for docs or social posts, produce syntax-highlighted images from source files, or explicitly mentions snipgrapher. Supports single-file renders, batch jobs, watch mode, and reusable named profiles via the snipgrapher CLI or npx.</description>
<location>global</location>
</skill>

<skill>
<name>social-content</name>
<description>"When the user wants help creating, scheduling, or optimizing social media content for LinkedIn, Twitter/X, Instagram, TikTok, Facebook, or other platforms. Also use when the user mentions 'LinkedIn post,' 'Twitter thread,' 'social media,' 'content calendar,' 'social scheduling,' 'engagement,' 'viral content,' 'what should I post,' 'repurpose this content,' 'tweet ideas,' 'LinkedIn carousel,' 'social media strategy,' or 'grow my following.' Use this for any social media content creation, repurposing, or scheduling task. For broader content strategy, see content-strategy."</description>
<location>global</location>
</skill>

<skill>
<name>spec-workflow</name>
<description>Standard software engineering workflow for requirement analysis, technical design, and task planning. Use this skill when developing new features, complex architecture designs, multi-module integrations, or projects involving database/UI design.</description>
<location>global</location>
</skill>

<skill>
<name>sql-injection-testing</name>
<description>SQL注入测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>ssrf-testing</name>
<description>SSRF服务器端请求伪造测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>statistical-analysis</name>
<description>Guided statistical analysis with test selection and reporting. Use when you need help choosing appropriate tests for your data, assumption checking, power analysis, and APA-formatted results. Best for academic research reporting, test selection guidance. For implementing specific models programmatically use statsmodels.</description>
<location>global</location>
</skill>

<skill>
<name>statistics</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>statsmodels</name>
<description>Statistical models library for Python. Use when you need specific model classes (OLS, GLM, mixed models, ARIMA) with detailed diagnostics, residuals, and inference. Best for econometrics, time series, rigorous inference with coefficient tables. For guided statistical test selection with APA reporting use statistical-analysis.</description>
<location>global</location>
</skill>

<skill>
<name>string-database</name>
<description>Query STRING API for protein-protein interactions (59M proteins, 20B interactions). Network analysis, GO/KEGG enrichment, interaction discovery, 5000+ species, for systems biology.</description>
<location>global</location>
</skill>

<skill>
<name>sympy</name>
<description>Use this skill when working with symbolic mathematics in Python. This skill should be used for symbolic computation tasks including solving equations algebraically, performing calculus operations (derivatives, integrals, limits), manipulating algebraic expressions, working with matrices symbolically, physics calculations, number theory problems, geometry computations, and generating executable code from mathematical expressions. Apply this skill when the user needs exact symbolic results rather than numerical approximations, or when working with mathematical formulas that contain variables and parameters.</description>
<location>global</location>
</skill>

<skill>
<name>tauri-v2</name>
<description>"Tauri v2 cross-platform app development with Rust backend. Use when configuring tauri.conf.json, implementing Rust commands (#[tauri::command]), setting up IPC patterns (invoke, emit, channels), configuring permissions/capabilities, troubleshooting build issues, or deploying desktop/mobile apps. Triggers on Tauri, src-tauri, invoke, emit, capabilities.json."</description>
<location>global</location>
</skill>

<skill>
<name>teach-impeccable</name>
<description>One-time setup that gathers design context for your project and saves it to your AI config file. Run once to establish persistent design guidelines.</description>
<location>global</location>
</skill>

<skill>
<name>text-forensics</name>
<description>Use when performing forensic text analysis, authorship attribution, psychological profiling from writing samples, sockpuppet or sybil detection, stylometric fingerprinting, or linguistic analysis of authorship. Triggers on "who wrote this", "same author", "writing style", "text fingerprint", "linguistic profile", "sockpuppet", "sybil account", "authorship verification", "stylometry".</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-adverse-event-detection</name>
<description>Detect and analyze adverse drug event signals using FDA FAERS data, drug labels, disproportionality analysis (PRR, ROR, IC), and biomedical evidence. Generates quantitative safety signal scores (0-100) with evidence grading. Use for post-market surveillance, pharmacovigilance, drug safety assessment, adverse event investigation, and regulatory decision support.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-antibody-engineering</name>
<description>Comprehensive antibody engineering and optimization for therapeutic development. Covers humanization, affinity maturation, developability assessment, and immunogenicity prediction. Use when asked to optimize antibodies, humanize sequences, or engineer therapeutic antibodies from lead to clinical candidate.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-binder-discovery</name>
<description>Discover novel small molecule binders for protein targets using structure-based and ligand-based approaches. Creates actionable reports with candidate compounds, ADMET profiles, and synthesis feasibility. Use when users ask to find small molecules for a target, identify novel binders, perform virtual screening, or need hit-to-lead compound identification.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-cancer-variant-interpretation</name>
<description>Provide comprehensive clinical interpretation of somatic mutations in cancer. Given a gene symbol + variant (e.g., EGFR L858R, BRAF V600E) and optional cancer type, performs multi-database analysis covering clinical evidence (CIViC), mutation prevalence (cBioPortal), therapeutic associations (OpenTargets, ChEMBL, FDA), resistance mechanisms, clinical trials, prognostic impact, and pathway context. Generates an evidence-graded markdown report with actionable recommendations for precision oncology. Use when oncologists, molecular tumor boards, or researchers ask about treatment options for specific cancer mutations, resistance mechanisms, or clinical trial matching.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-chemical-compound-retrieval</name>
<description>Retrieves chemical compound information from PubChem and ChEMBL with disambiguation, cross-referencing, and quality assessment. Creates comprehensive compound profiles with identifiers, properties, bioactivity, and drug information. Use when users need chemical data, drug information, or mention PubChem CID, ChEMBL ID, SMILES, InChI, or compound names.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-chemical-safety</name>
<description>Comprehensive chemical safety and toxicology assessment integrating ADMET-AI predictions, CTD toxicogenomics, FDA label safety data, DrugBank safety profiles, and STITCH chemical-protein interactions. Performs predictive toxicology (AMES, DILI, LD50, carcinogenicity), organ/system toxicity profiling, chemical-gene-disease relationship mapping, regulatory safety extraction, and environmental hazard assessment. Use when asked about chemical toxicity, drug safety profiling, ADMET properties, environmental health risks, chemical hazard assessment, or toxicogenomic analysis.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-clinical-guidelines</name>
<description>Search and retrieve clinical practice guidelines across 12+ authoritative sources including NICE, WHO, ADA, AHA/ACC, NCCN, SIGN, CPIC, CMA, CTFPHC, GIN, MAGICapp, PubMed, EuropePMC, TRIP, and OpenAlex. Covers disease management, cardiology, oncology, diabetes, pharmacogenomics, and more. Use when users ask about clinical guidelines, treatment recommendations, standard of care, evidence-based medicine, or drug-gene dosing recommendations.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-clinical-trial-design</name>
<description>Strategic clinical trial design feasibility assessment using ToolUniverse. Evaluates patient population sizing, biomarker prevalence, endpoint selection, comparator analysis, safety monitoring, and regulatory pathways. Creates comprehensive feasibility reports with evidence grading, enrollment projections, and trial design recommendations. Use when planning Phase 1/2 trials, assessing trial feasibility, or designing biomarker-driven studies.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-clinical-trial-matching</name>
<description>AI-driven patient-to-trial matching for precision medicine and oncology. Given a patient profile (disease, molecular alterations, stage, prior treatments), discovers and ranks clinical trials from ClinicalTrials.gov using multi-dimensional matching across molecular eligibility, clinical criteria, drug-biomarker alignment, evidence strength, and geographic feasibility. Produces a quantitative Trial Match Score (0-100) per trial with tiered recommendations and a comprehensive markdown report. Use when oncologists, molecular tumor boards, or patients ask about clinical trial options for specific cancer types, biomarker profiles, or post-progression scenarios.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-crispr-screen-analysis</name>
<description>Comprehensive CRISPR screen analysis for functional genomics. Analyze pooled or arrayed CRISPR screens (knockout, activation, interference) to identify essential genes, synthetic lethal interactions, and drug targets. Perform sgRNA count processing, gene-level scoring (MAGeCK, BAGEL), quality control, pathway enrichment, and drug target prioritization. Use for CRISPR screen analysis, gene essentiality studies, synthetic lethality detection, functional genomics, drug target validation, or identifying genetic vulnerabilities.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-disease-research</name>
<description>Generate comprehensive disease research reports using 100+ ToolUniverse tools. Creates a detailed markdown report file and progressively updates it with findings from 10 research dimensions. All information includes source references. Use when users ask about diseases, syndromes, or need systematic disease analysis.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-drug-drug-interaction</name>
<description>Comprehensive drug-drug interaction (DDI) prediction and risk assessment. Analyzes interaction mechanisms (CYP450, transporters, pharmacodynamic), severity classification, clinical evidence grading, and provides management strategies. Supports single drug pairs, polypharmacy analysis (3+ drugs), and alternative drug recommendations. Use when users ask about drug interactions, medication safety, polypharmacy risks, or need DDI assessment for clinical decision support.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-drug-repurposing</name>
<description>Identify drug repurposing candidates using ToolUniverse for target-based, compound-based, and disease-driven strategies. Searches existing drugs for new therapeutic indications by analyzing targets, bioactivity, safety profiles, and literature evidence. Use when exploring drug repurposing opportunities, finding new indications for approved drugs, or when users mention drug repositioning, off-label uses, or therapeutic alternatives.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-drug-research</name>
<description>Generates comprehensive drug research reports with compound disambiguation, evidence grading, and mandatory completeness sections. Covers identity, chemistry, pharmacology, targets, clinical trials, safety, pharmacogenomics, and ADMET properties. Use when users ask about drugs, medications, therapeutics, or need drug profiling, safety assessment, or clinical development research.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-drug-target-validation</name>
<description>Comprehensive computational validation of drug targets for early-stage drug discovery. Evaluates targets across 10 dimensions (disambiguation, disease association, druggability, chemical matter, clinical precedent, safety, pathway context, validation evidence, structural insights, validation roadmap) using 60+ ToolUniverse tools. Produces a quantitative Target Validation Score (0-100) with GO/NO-GO recommendation. Use when users ask about target validation, druggability assessment, target prioritization, or "is X a good drug target for Y?"</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-epigenomics</name>
<description>Production-ready genomics and epigenomics data processing for BixBench questions. Handles methylation array analysis (CpG filtering, differential methylation, age-related CpG detection, chromosome-level density), ChIP-seq peak analysis (peak calling, motif enrichment, coverage stats), ATAC-seq chromatin accessibility, multi-omics integration (expression + methylation correlation), and genome-wide statistics. Pure Python computation (pandas, scipy, numpy, pysam, statsmodels) plus ToolUniverse annotation tools (Ensembl, ENCODE, SCREEN, JASPAR, ReMap, RegulomeDB, ChIPAtlas). Supports BED, BigWig, methylation beta-value matrices, Illumina manifest files, and multi-sample clinical data. Use when processing methylation data, ChIP-seq peaks, ATAC-seq signals, or answering questions about CpG sites, differential methylation, chromatin accessibility, histone marks, or epigenomic statistics.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-expression-data-retrieval</name>
<description>Retrieves gene expression and omics datasets from ArrayExpress and BioStudies with gene disambiguation, experiment quality assessment, and structured reports. Creates comprehensive dataset profiles with metadata, sample information, and download links. Use when users need expression data, omics datasets, or mention ArrayExpress (E-MTAB, E-GEOD) or BioStudies (S-BSST) accessions.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-gene-enrichment</name>
<description>Perform comprehensive gene enrichment and pathway analysis using gseapy (ORA and GSEA), PANTHER, STRING, Reactome, and 40+ ToolUniverse tools. Supports GO enrichment (BP, MF, CC), KEGG, Reactome, WikiPathways, MSigDB Hallmark, and 220+ Enrichr libraries. Handles multiple ID types (gene symbols, Ensembl, Entrez, UniProt), multiple organisms (human, mouse, rat, fly, worm, yeast), customizable backgrounds, and multiple testing correction (BH, Bonferroni). Use when users ask about gene enrichment, pathway analysis, GO term enrichment, KEGG pathway analysis, GSEA, over-representation analysis, functional annotation, or gene set analysis.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-gwas-drug-discovery</name>
<description>Transform GWAS signals into actionable drug targets and repurposing opportunities. Performs locus-to-gene mapping, target druggability assessment, existing drug identification, safety profile evaluation, and clinical trial matching. Use when discovering drug targets from GWAS data, finding drug repurposing opportunities from genetic associations, or translating GWAS findings into therapeutic leads.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-gwas-finemapping</name>
<description>Identify and prioritize causal variants at GWAS loci using statistical fine-mapping and locus-to-gene predictions. Computes posterior probabilities for causal variants, links variants to genes via L2G predictions, annotates functional consequences, and suggests validation strategies. Use when asked to fine-map GWAS loci, prioritize causal variants, identify credible sets, or link GWAS signals to causal genes.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-gwas-snp-interpretation</name>
<description>Interpret genetic variants (SNPs) from GWAS studies by aggregating evidence from multiple databases (GWAS Catalog, Open Targets Genetics, ClinVar). Retrieves variant annotations, GWAS trait associations, fine-mapping evidence, locus-to-gene predictions, and clinical significance. Use when asked to interpret a SNP by rsID, find disease associations for a variant, assess clinical significance, or answer questions like "What diseases is rs429358 associated with?" or "Interpret rs7903146".</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-gwas-study-explorer</name>
<description>Compare GWAS studies, perform meta-analyses, and assess replication across cohorts. Integrates NHGRI-EBI GWAS Catalog and Open Targets Genetics to compare study designs, effect sizes, ancestry diversity, and heterogeneity statistics. Use when comparing GWAS studies for a trait, performing meta-analysis of genetic loci, assessing replication across cohorts, or exploring the genetic architecture of complex diseases.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-gwas-trait-to-gene</name>
<description>Discover genes associated with diseases and traits using GWAS data from the GWAS Catalog (500,000+ associations) and Open Targets Genetics (L2G predictions). Identifies genetic risk factors, prioritizes causal genes via locus-to-gene scoring, and assesses druggability. Use when asked to find genes associated with a disease or trait, discover genetic risk factors, translate GWAS signals to gene targets, or answer questions like "What genes are associated with type 2 diabetes?"</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-image-analysis</name>
<description>Production-ready microscopy image analysis and quantitative imaging data skill for colony morphometry, cell counting, fluorescence quantification, and statistical analysis of imaging-derived measurements. Processes ImageJ/CellProfiler output (area, circularity, intensity, cell counts), performs Dunnett's test, Cohen's d effect size, power analysis, Shapiro-Wilk normality tests, two-way ANOVA, polynomial regression, natural spline regression with confidence intervals, and comparative morphometry. Supports CSV/TSV measurement tables, multi-channel fluorescence data, colony swarming assays, and neuron counting datasets. Use when analyzing microscopy measurement data, colony area/circularity, cell count statistics, swarming assays, co-culture ratio optimization, or answering questions about imaging-derived quantitative data.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-immune-repertoire-analysis</name>
<description>Comprehensive immune repertoire analysis for T-cell and B-cell receptor sequencing data. Analyze TCR/BCR repertoires to assess clonality, diversity, V(D)J gene usage, CDR3 characteristics, convergence, and predict epitope specificity. Integrate with single-cell data for clonotype-phenotype associations. Use for adaptive immune response profiling, cancer immunotherapy research, vaccine response assessment, autoimmune disease studies, or repertoire diversity analysis in immunology research.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-immunotherapy-response-prediction</name>
<description>Predict patient response to immune checkpoint inhibitors (ICIs) using multi-biomarker integration. Given a cancer type, somatic mutations, and optional biomarkers (TMB, PD-L1, MSI status), performs systematic analysis across 11 phases covering TMB classification, neoantigen burden estimation, MSI/MMR assessment, PD-L1 evaluation, immune microenvironment profiling, mutation-based resistance/sensitivity prediction, clinical evidence retrieval, and multi-biomarker score integration. Generates a quantitative ICI Response Score (0-100), response likelihood tier, specific ICI drug recommendations with evidence, resistance risk factors, and a monitoring plan. Use when oncologists ask about immunotherapy eligibility, checkpoint inhibitor selection, or biomarker-guided ICI treatment decisions.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-infectious-disease</name>
<description>Rapid pathogen characterization and drug repurposing analysis for infectious disease outbreaks. Identifies pathogen taxonomy, essential proteins, predicts structures, and screens existing drugs via docking. Use when facing novel pathogens, emerging infections, or needing rapid therapeutic options during outbreaks.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-literature-deep-research</name>
<description>Conduct comprehensive literature research with target disambiguation, evidence grading, and structured theme extraction. Creates a detailed report with mandatory completeness checklist, biological model synthesis, and testable hypotheses. For biological targets, resolves official IDs (Ensembl/UniProt), synonyms, naming collisions, and gathers expression/pathway context before literature search. Default deliverable is a report file; for single factoid questions, uses a fast verification mode and may include an inline answer. Use when users need thorough literature reviews, target profiles, or to verify specific claims from the literature.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-metabolomics</name>
<description>Comprehensive metabolomics research skill for identifying metabolites, analyzing studies, and searching metabolomics databases. Integrates HMDB (220k+ metabolites), MetaboLights, Metabolomics Workbench, and PubChem. Use when asked to identify or annotate metabolites (HMDB IDs, chemical properties, pathways), retrieve metabolomics study information from MetaboLights (MTBLS*) or Metabolomics Workbench (ST*), search for studies by keywords or disease, or generate comprehensive metabolomics research reports.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-metabolomics-analysis</name>
<description>Analyze metabolomics data including metabolite identification, quantification, pathway analysis, and metabolic flux. Processes LC-MS, GC-MS, NMR data from targeted and untargeted experiments. Performs normalization, statistical analysis, pathway enrichment, metabolite-enzyme integration, and biomarker discovery. Use when analyzing metabolomics datasets, identifying differential metabolites, studying metabolic pathways, integrating with transcriptomics/proteomics, discovering metabolic biomarkers, performing flux balance analysis, or characterizing metabolic phenotypes in disease, drug response, or physiological conditions.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-multi-omics-integration</name>
<description>Integrate and analyze multiple omics datasets (transcriptomics, proteomics, epigenomics, genomics, metabolomics) for systems biology and precision medicine. Performs cross-omics correlation, multi-omics clustering (MOFA+, NMF), pathway-level integration, and sample matching. Coordinates ToolUniverse skills for expression data (RNA-seq), epigenomics (methylation, ChIP-seq), variants (SNVs, CNVs), protein interactions, and pathway enrichment. Use when analyzing multi-omics datasets, performing integrative analysis, discovering multi-omics biomarkers, studying disease mechanisms across molecular layers, or conducting systems biology research that requires coordinated analysis of transcriptome, genome, epigenome, proteome, and metabolome data.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-multiomic-disease-characterization</name>
<description>Comprehensive multi-omics disease characterization integrating genomics, transcriptomics, proteomics, pathway, and therapeutic layers for systems-level understanding. Produces a detailed multi-omics report with quantitative confidence scoring (0-100), cross-layer gene concordance analysis, biomarker candidates, therapeutic opportunities, and mechanistic hypotheses. Uses 80+ ToolUniverse tools across 8 analysis layers. Use when users ask about disease mechanisms, multi-omics analysis, systems biology of disease, biomarker discovery, or therapeutic target identification from a disease perspective.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-network-pharmacology</name>
<description>Construct and analyze compound-target-disease networks for drug repurposing, polypharmacology discovery, and systems pharmacology. Builds multi-layer networks from ChEMBL, OpenTargets, STRING, DrugBank, Reactome, FAERS, and 60+ other ToolUniverse tools. Calculates Network Pharmacology Scores (0-100), identifies repurposing candidates, predicts mechanisms, and analyzes polypharmacology. Use when users ask about drug repurposing via network analysis, multi-target drug effects, compound-target-disease networks, systems pharmacology, or polypharmacology.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-pharmacovigilance</name>
<description>Analyze drug safety signals from FDA adverse event reports, label warnings, and pharmacogenomic data. Calculates disproportionality measures (PRR, ROR), identifies serious adverse events, assesses pharmacogenomic risk variants. Use when asked about drug safety, adverse events, post-market surveillance, or risk-benefit assessment.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-phylogenetics</name>
<description>Production-ready phylogenetics and sequence analysis skill for alignment processing, tree analysis, and evolutionary metrics. Computes treeness, RCV, treeness/RCV, parsimony informative sites, evolutionary rate, DVMC, tree length, alignment gap statistics, GC content, and bootstrap support using PhyKIT, Biopython, and DendroPy. Performs NJ/UPGMA/parsimony tree construction, Robinson-Foulds distance, Mann-Whitney U tests, and batch analysis across gene families. Integrates with ToolUniverse for sequence retrieval (NCBI, UniProt, Ensembl) and tree annotation. Use when processing FASTA/PHYLIP/Nexus/Newick files, computing phylogenetic metrics, comparing taxa groups, or answering questions about alignments, trees, parsimony, or molecular evolution.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-polygenic-risk-score</name>
<description>Build and interpret polygenic risk scores (PRS) for complex diseases using GWAS summary statistics. Calculates genetic risk profiles, interprets PRS percentiles, and assesses disease predisposition across conditions including type 2 diabetes, coronary artery disease, and Alzheimer's disease. Use when asked to calculate polygenic risk scores, interpret genetic risk for complex diseases, build custom PRS from GWAS data, or answer questions like "What is my genetic predisposition to breast cancer?"</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-precision-medicine-stratification</name>
<description>Comprehensive patient stratification for precision medicine by integrating genomic, clinical, and therapeutic data. Given a disease/condition, genomic data (germline variants, somatic mutations, expression), and optional clinical parameters, performs multi-phase analysis across 9 phases covering disease disambiguation, genetic risk assessment, disease-specific molecular stratification, pharmacogenomic profiling, comorbidity/DDI risk, pathway analysis, clinical evidence and guideline mapping, clinical trial matching, and integrated outcome prediction. Generates a quantitative Precision Medicine Risk Score (0-100) with risk tier assignment (Low/Intermediate/High/Very High), treatment algorithm (1st/2nd/3rd line), pharmacogenomic guidance, clinical trial matches, and monitoring plan. Use when clinicians ask about patient risk stratification, treatment selection, prognosis prediction, or personalized therapeutic strategy across cancer, metabolic, cardiovascular, neurological, or rare diseases.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-precision-oncology</name>
<description>Provide actionable treatment recommendations for cancer patients based on molecular profile. Interprets tumor mutations, identifies FDA-approved therapies, finds resistance mechanisms, matches clinical trials. Use when oncologist asks about treatment options for specific mutations (EGFR, KRAS, BRAF, etc.), therapy resistance, or clinical trial eligibility.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-protein-interactions</name>
<description>Analyze protein-protein interaction networks using STRING, BioGRID, and SASBDB databases. Maps protein identifiers, retrieves interaction networks with confidence scores, performs functional enrichment analysis (GO/KEGG/Reactome), and optionally includes structural data. No API key required for core functionality (STRING). Use when analyzing protein networks, discovering interaction partners, identifying functional modules, or studying protein complexes.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-protein-structure-retrieval</name>
<description>Retrieves protein structure data from RCSB PDB, PDBe, and AlphaFold with protein disambiguation, quality assessment, and comprehensive structural profiles. Creates detailed structure reports with experimental metadata, ligand information, and download links. Use when users need protein structures, 3D models, crystallography data, or mention PDB IDs (4-character codes like 1ABC) or UniProt accessions.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-protein-therapeutic-design</name>
<description>Design novel protein therapeutics (binders, enzymes, scaffolds) using AI-guided de novo design. Uses RFdiffusion for backbone generation, ProteinMPNN for sequence design, ESMFold/AlphaFold2 for validation. Use when asked to design protein binders, therapeutic proteins, or engineer protein function.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-proteomics-analysis</name>
<description>Analyze mass spectrometry proteomics data including protein quantification, differential expression, post-translational modifications (PTMs), and protein-protein interactions. Processes MaxQuant, Spectronaut, DIA-NN, and other MS platform outputs. Performs normalization, statistical analysis, pathway enrichment, and integration with transcriptomics. Use when analyzing proteomics data, comparing protein abundance between conditions, identifying PTM changes, studying protein complexes, integrating protein and RNA data, discovering protein biomarkers, or conducting quantitative proteomics experiments.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-rare-disease-diagnosis</name>
<description>Provide differential diagnosis for patients with suspected rare diseases based on phenotype and genetic data. Matches symptoms to HPO terms, identifies candidate diseases from Orphanet/OMIM, prioritizes genes for testing, interprets variants of uncertain significance. Use when clinician asks about rare disease diagnosis, unexplained phenotypes, or genetic testing interpretation.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-rnaseq-deseq2</name>
<description>Production-ready RNA-seq differential expression analysis using PyDESeq2. Performs DESeq2 normalization, dispersion estimation, Wald testing, LFC shrinkage, and result filtering. Handles multi-factor designs, multiple contrasts, batch effects, and integrates with gene enrichment (gseapy) and ToolUniverse annotation tools (UniProt, Ensembl, OpenTargets). Supports CSV/TSV/H5AD input formats and any organism. Use when analyzing RNA-seq count matrices, identifying DEGs, performing differential expression with statistical rigor, or answering questions about gene expression changes.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-sequence-retrieval</name>
<description>Retrieves biological sequences (DNA, RNA, protein) from NCBI and ENA with gene disambiguation, accession type handling, and comprehensive sequence profiles. Creates detailed reports with sequence metadata, cross-database references, and download options. Use when users need nucleotide sequences, protein sequences, genome data, or mention GenBank, RefSeq, EMBL accessions.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-single-cell</name>
<description>"Production-ready single-cell and expression matrix analysis using scanpy, anndata, and scipy. Performs scRNA-seq QC, normalization, PCA, UMAP, Leiden/Louvain clustering, differential expression (Wilcoxon, t-test, DESeq2), cell type annotation, per-cell-type statistical analysis, gene-expression correlation, batch correction (Harmony), trajectory inference, and cell-cell communication analysis. NEW: Analyzes ligand-receptor interactions between cell types using OmniPath (CellPhoneDB, CellChatDB), scores communication strength, identifies signaling cascades, and handles multi-subunit receptor complexes. Integrates with ToolUniverse gene annotation tools (HPA, Ensembl, MyGene, UniProt) and enrichment tools (gseapy, PANTHER, STRING). Supports h5ad, 10X, CSV/TSV count matrices, and pre-annotated datasets. Use when analyzing single-cell RNA-seq data, studying cell-cell interactions, performing cell type differential expression, computing gene-expression correlations by cell type, analyzing tumor-immune communication, or answering questions about scRNA-seq datasets."</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-spatial-omics-analysis</name>
<description>Computational analysis framework for spatial multi-omics data integration. Given spatially variable genes (SVGs), spatial domain annotations, tissue type, and disease context from spatial transcriptomics/proteomics experiments (10x Visium, MERFISH, DBiTplus, SLIDE-seq, etc.), performs comprehensive biological interpretation including pathway enrichment, cell-cell interaction inference, druggable target identification, immune microenvironment characterization, and multi-modal integration. Produces a detailed markdown report with Spatial Omics Integration Score (0-100), domain-by-domain characterization, and validation recommendations. Uses 70+ ToolUniverse tools across 9 analysis phases. Use when users ask about spatial transcriptomics analysis, spatial omics interpretation, tissue heterogeneity, spatial gene expression patterns, tumor microenvironment mapping, tissue zonation, or cell-cell communication from spatial data.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-spatial-transcriptomics</name>
<description>Analyze spatial transcriptomics data to map gene expression in tissue architecture. Supports 10x Visium, MERFISH, seqFISH, Slide-seq, and imaging-based platforms. Performs spatial clustering, domain identification, cell-cell proximity analysis, spatial gene expression patterns, tissue architecture mapping, and integration with single-cell data. Use when analyzing spatial transcriptomics datasets, studying tissue organization, identifying spatial expression patterns, mapping cell-cell interactions in tissue context, characterizing tumor microenvironment spatial structure, or integrating spatial and single-cell RNA-seq data for comprehensive tissue analysis.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-statistical-modeling</name>
<description>Perform statistical modeling and regression analysis on biomedical datasets. Supports linear regression, logistic regression (binary/ordinal/multinomial), mixed-effects models, Cox proportional hazards survival analysis, Kaplan-Meier estimation, and comprehensive model diagnostics. Extracts odds ratios, hazard ratios, confidence intervals, p-values, and effect sizes. Designed to solve BixBench statistical reasoning questions involving clinical/experimental data. Use when asked to fit regression models, compute odds ratios, perform survival analysis, run statistical tests, or interpret model coefficients from provided data.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-structural-variant-analysis</name>
<description>Comprehensive structural variant (SV) analysis skill for clinical genomics. Classifies SVs (deletions, duplications, inversions, translocations), assesses pathogenicity using ACMG-adapted criteria, evaluates gene disruption and dosage sensitivity, and provides clinical interpretation with evidence grading. Use when analyzing CNVs, large deletions/duplications, chromosomal rearrangements, or any structural variants requiring clinical interpretation.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-systems-biology</name>
<description>Comprehensive systems biology and pathway analysis using multiple pathway databases (Reactome, KEGG, WikiPathways, Pathway Commons, BioModels). Performs pathway enrichment, protein-pathway mapping, keyword searches, and systems-level analysis. Use when analyzing gene sets, exploring biological pathways, or investigating systems-level biology.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-target-research</name>
<description>Gather comprehensive biological target intelligence from 9 parallel research paths covering protein info, structure, interactions, pathways, expression, variants, drug interactions, and literature. Features collision-aware searches, evidence grading (T1-T4), explicit Open Targets coverage, and mandatory completeness auditing. Use when users ask about drug targets, proteins, genes, or need target validation, druggability assessment, or comprehensive target profiling.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-variant-analysis</name>
<description>Production-ready VCF processing, variant annotation, mutation analysis, and structural variant (SV/CNV) interpretation for bioinformatics questions. Parses VCF files (streaming, large files), classifies mutation types (missense, nonsense, synonymous, frameshift, splice, intronic, intergenic) and structural variants (deletions, duplications, inversions, translocations), applies VAF/depth/quality/consequence filters, annotates with ClinVar/dbSNP/gnomAD/CADD via ToolUniverse, interprets SV/CNV clinical significance using ClinGen dosage sensitivity scores, computes variant statistics, and generates reports. Solves questions like "What fraction of variants with VAF < 0.3 are missense?", "How many non-reference variants remain after filtering intronic/intergenic?", "What is the pathogenicity of this deletion affecting BRCA1?", or "Which dosage-sensitive genes overlap this CNV?". Use when processing VCF files, annotating variants, filtering by VAF/depth/consequence, classifying mutations, interpreting structural variants, assessing CNV pathogenicity, comparing cohorts, or answering variant analysis questions.</description>
<location>global</location>
</skill>

<skill>
<name>tooluniverse-variant-interpretation</name>
<description>Systematic clinical variant interpretation from raw variant calls to ACMG-classified recommendations with structural impact analysis. Aggregates evidence from ClinVar, gnomAD, CIViC, UniProt, and PDB across ACMG criteria. Produces pathogenicity scores (0-100), clinical recommendations, and treatment implications. Use when interpreting genetic variants, classifying variants of uncertain significance (VUS), performing ACMG variant classification, or translating variant calls to clinical actionability.</description>
<location>global</location>
</skill>

<skill>
<name>torch_geometric</name>
<description>Graph Neural Networks (PyG). Node/graph classification, link prediction, GCN, GAT, GraphSAGE, heterogeneous graphs, molecular property prediction, for geometric deep learning.</description>
<location>global</location>
</skill>

<skill>
<name>torchdrug</name>
<description>PyTorch-native graph neural networks for molecules and proteins. Use when building custom GNN architectures for drug discovery, protein modeling, or knowledge graph reasoning. Best for custom model development, protein property prediction, retrosynthesis. For pre-trained models and diverse featurizers use deepchem; for benchmark datasets use pytdc.</description>
<location>global</location>
</skill>

<skill>
<name>transformers</name>
<description>This skill should be used when working with pre-trained transformer models for natural language processing, computer vision, audio, or multimodal tasks. Use for text generation, classification, question answering, translation, summarization, image classification, object detection, speech recognition, and fine-tuning models on custom datasets.</description>
<location>global</location>
</skill>

<skill>
<name>treatment-plans</name>
<description>Generate concise (3-4 page), focused medical treatment plans in LaTeX/PDF format for all clinical specialties. Supports general medical treatment, rehabilitation therapy, mental health care, chronic disease management, perioperative care, and pain management. Includes SMART goal frameworks, evidence-based interventions with minimal text citations, regulatory compliance (HIPAA), and professional formatting. Prioritizes brevity and clinical actionability.</description>
<location>global</location>
</skill>

<skill>
<name>typescript-magician</name>
<description>Designs complex generic types, refactors `any` types to strict alternatives, creates type guards and utility types, and resolves TypeScript compiler errors. Use when the user asks about TypeScript (TS) types, generics, type inference, type guards, removing `any` types, strict typing, type errors, `infer`, `extends`, conditional types, mapped types, template literal types, branded/opaque types, or utility types like `Partial`, `Record`, `ReturnType`, and `Awaited`.</description>
<location>global</location>
</skill>

<skill>
<name>ui-design</name>
<description>Professional UI design and frontend interface guidelines. Use this skill when creating web pages, mini-program interfaces, prototypes, or any frontend UI components that require distinctive, production-grade design with exceptional aesthetic quality.</description>
<location>global</location>
</skill>

<skill>
<name>umap-learn</name>
<description>UMAP dimensionality reduction. Fast nonlinear manifold learning for 2D/3D visualization, clustering preprocessing (HDBSCAN), supervised/parametric UMAP, for high-dimensional data.</description>
<location>global</location>
</skill>

<skill>
<name>uniprot-database</name>
<description>Direct REST API access to UniProt. Protein searches, FASTA retrieval, ID mapping, Swiss-Prot/TrEMBL. For Python workflows with multiple databases, prefer bioservices (unified interface to 40+ services). Use this for direct HTTP/REST work or UniProt-specific control.</description>
<location>global</location>
</skill>

<skill>
<name>uspto-database</name>
<description>Access USPTO APIs for patent/trademark searches, examination history (PEDS), assignments, citations, office actions, TSDR, for IP analysis and prior art searches.</description>
<location>global</location>
</skill>

<skill>
<name>vaex</name>
<description>Use this skill for processing and analyzing large tabular datasets (billions of rows) that exceed available RAM. Vaex excels at out-of-core DataFrame operations, lazy evaluation, fast aggregations, efficient visualization of big data, and machine learning on large datasets. Apply when users need to work with large CSV/HDF5/Arrow/Parquet files, perform fast statistics on massive datasets, create visualizations of big data, or build ML pipelines that do not fit in memory.</description>
<location>global</location>
</skill>

<skill>
<name>venue-templates</name>
<description>Access comprehensive LaTeX templates, formatting requirements, and submission guidelines for major scientific publication venues (Nature, Science, PLOS, IEEE, ACM), academic conferences (NeurIPS, ICML, CVPR, CHI), research posters, and grant proposals (NSF, NIH, DOE, DARPA). This skill should be used when preparing manuscripts for journal submission, conference papers, research posters, or grant proposals and need venue-specific formatting requirements and templates.</description>
<location>global</location>
</skill>

<skill>
<name>vercel-react-best-practices</name>
<description>React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimization, or performance improvements.</description>
<location>global</location>
</skill>

<skill>
<name>visualization</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>voice_command_to_skill</name>
<description>Maps natural language voice commands to concrete LabClaw skill invocations. Parses ASR output, identifies intent, selects target skill, fills parameters from context, and provides prompt templates — enabling hands-free, voice-driven anywhere-lab experiences where researchers control analysis, guidance, and data export by speaking.</description>
<location>global</location>
</skill>

<skill>
<name>vulnerability-assessment</name>
<description>漏洞评估的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>web-design-guidelines</name>
<description>Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".</description>
<location>global</location>
</skill>

<skill>
<name>web-development</name>
<description>Web frontend project development rules. Use this skill when developing web frontend pages, deploying static hosting, and integrating CloudBase Web SDK.</description>
<location>global</location>
</skill>

<skill>
<name>wechat-miniprogram-skill</name>
<description>Expert guidelines for Native WeChat Mini Program development focusing on performance, code size, and native compatibility. Use when developing WeChat Mini Programs in native JavaScript.</description>
<location>global</location>
</skill>

<skill>
<name>writing</name>
<description></description>
<location>global</location>
</skill>

<skill>
<name>x-scraper</name>
<description>Use when scraping X (Twitter) data - user profiles, tweets, followers, following lists, tweet replies, retweeters. Triggers on "scrape twitter", "scrape X", "get tweets", "fetch followers", "twitter data", "X API", "twscrape".</description>
<location>global</location>
</skill>

<skill>
<name>xpath-injection-testing</name>
<description>XPath注入漏洞测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>xss-testing</name>
<description>XSS跨站脚本攻击测试的专业技能</description>
<location>global</location>
</skill>

<skill>
<name>xxe-testing</name>
<description>XXE XML外部实体注入测试的专业技能和方法论</description>
<location>global</location>
</skill>

<skill>
<name>youtube-downloader</name>
<description>Download YouTube videos with customizable quality and format options. Use this skill when the user asks to download, save, or grab YouTube videos. Supports various quality settings (best, 1080p, 720p, 480p, 360p), multiple formats (mp4, webm, mkv), and audio-only downloads as MP3.</description>
<location>global</location>
</skill>

<skill>
<name>zarr-python</name>
<description>Chunked N-D arrays for cloud storage. Compressed arrays, parallel I/O, S3/GCS integration, NumPy/Dask/Xarray compatible, for large-scale scientific computing pipelines.</description>
<location>global</location>
</skill>

<skill>
<name>zinc-database</name>
<description>Access ZINC (230M+ purchasable compounds). Search by ZINC ID/SMILES, similarity searches, 3D-ready structures for docking, analog discovery, for virtual screening and drug discovery.</description>
<location>global</location>
</skill>

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>
