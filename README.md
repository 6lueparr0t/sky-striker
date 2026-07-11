# Sky Striker ✈️

세로 스크롤 비행기 슈팅 게임. **바닐라 JS + HTML5 Canvas**로 만들고 **Neutralinojs**로 감싼 데스크톱 앱입니다.

> 지구를 침공한 함대는 사실 과거에 지구를 떠난 인류였다 — 블랙홀과 시간 왜곡이 만든 비극을, 5개의 스테이지와 숨겨진 결말로 풀어냅니다.

## 특징

- **5개 스테이지 + 중간 보스 2종 + 최종 보스** — 순양함, 초대형 우주정거장, 사이버펑크 배틀크루저(패턴 11종·분노 스케일링).
- **패링 시스템** — 젤다식 반사(X). 적 탄을 3배 데미지로 유도 반사, 연속 패링 가능. 반사 게이지가 차면 화면 탄막 전체 소거(C).
- **무한 모드** — 스테이지 1~5 무한 루프, 루프마다 난이도 상승.
- **히든 스테이지 & 진엔딩** — 2회차 클리어 시 개방. 블랙홀 인력을 버티며 생존자 전원 구출.
- **파워업** — 발사 1~5단, 유도미사일, 목숨·조력 UFO까지. 아이템은 금색 캐리어 적에게서만 드랍.
- **외부 에셋 0개** — 그래픽은 전부 캔버스 도형, 효과음·BGM은 WebAudio 실시간 합성. 폐쇄망에서도 문제없이 빌드/실행.

## 조작

| 키 | 기능 |
| --- | --- |
| 방향키 | 이동 |
| Z | 발사 / 시작 |
| X | 패링 |
| C | 탄막 소거 (게이지 가득 찼을 때) |
| Enter | 시작 · 스토리 넘김 |
| ↑ / ↓ | (메뉴) 게임 시작 / 무한 모드 선택 |
| P / ESC | 일시정지 |
| Alt+Enter (Mac ⌘+Enter) | 전체화면 토글 |

유도미사일(`M` 아이템)은 자동 발사됩니다.

## 실행 / 빌드

```bash
pnpm install
pnpm dev              # 개발 실행 (neu run)
pnpm build            # dist/ 에 배포용 바이너리 (neu build --release)
pnpm build:mac        # macOS .app 번들까지 생성
```

배포본은 실행 파일 + `resources.neu` 두 파일 세트(~2MB)면 동작합니다.

## 기술 구성

- **프레임워크/엔진 없음** — 순수 바닐라 JS + Canvas 2D, `requestAnimationFrame` + delta-time 게임 루프.
- **오디오** — WebAudio로 효과음·칩튠 BGM 실시간 합성 (오디오 파일 0개).
- **저장** — 하이스코어/클리어 횟수를 `localStorage` + `Neutralino.storage` 이중 저장.
- **왜 Neutralinojs?** — 사내 폐쇄망에서 crates.io가 차단돼 Tauri 빌드가 막혔고, Electron은 용량 부담이 커서 OS 웹뷰 기반의 Neutralinojs를 선택했습니다. (자세한 배경은 [DEVLOG.md](DEVLOG.md))

```text
sky-striker/
├── neutralino.config.json
└── resources/
    ├── index.html        # 캔버스만
    ├── styles.css        # 다크 배경 + 네온 글로우
    └── js/
        ├── main.js       # Neutralino 부트스트랩
        └── game.js       # 게임 전체 로직
```

## License

[MIT](LICENSE)
