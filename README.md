# 서울시 도시계획 정비사업 현황 지도 대시보드

서울 열린데이터광장의 `도시계획 정비사업 현황(upisRebuild)` API 데이터를 Kakao Maps 위에 시각화하는 대시보드입니다.

## 왜 서버가 필요한가요?

`openapi.seoul.go.kr`은 브라우저 CORS 정책에 필요한 응답 헤더(`Access-Control-Allow-Origin`)를 보내지 않습니다. 그래서 브라우저에서 직접 호출할 수 없고, Node.js 서버(`server.js`)가 대신 API를 호출해 캐싱한 뒤 프론트엔드에 전달하는 프록시 구조로 만들었습니다.

또한 원본 API에는 위경도 좌표가 없기 때문에, 프론트엔드에서 각 사업의 위치명(`PSTN_NM`)을 Kakao Geocoder로 지오코딩하고, 얻어진 좌표를 다시 역지오코딩(`coord2RegionCode`)해서 자치구를 판별합니다. (API의 `LOGVM` 필드는 모든 행이 "서울특별시"로 고정되어 있어 자치구 필터로 쓸 수 없습니다.)

## 실행 방법

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000` 접속.

## Kakao 개발자 설정 (필수)

Kakao Maps JavaScript SDK를 사용하려면 [Kakao Developers](https://developers.kakao.com)에서 만든 앱의 **JavaScript 키** 설정에 실행 도메인을 등록해야 합니다.

1. 내 애플리케이션 → 앱 선택 → `앱 키` 또는 `플랫폼 키` → `JavaScript 키`
2. `JavaScript SDK 도메인`에 아래 주소 등록
   - `http://localhost:3000`
   - (배포 시 실제 서비스 도메인도 함께 등록)

등록하지 않으면 지도가 로드되지 않고 콘솔에 도메인 관련 오류가 표시됩니다.

## 인터넷에 배포하기 (Render.com, 무료)

로컬에서만 실행하면 `http://localhost:3000`은 본인 컴퓨터에서만 접속됩니다. 다른 사람도 접속할 수 있게 하려면 Render.com에 배포하세요 (신용카드 등록 없이 무료로 사용 가능).

1. [render.com](https://render.com) 접속 → GitHub 계정으로 가입/로그인
2. 대시보드에서 `New +` → `Blueprint` 선택 → 이 저장소(`jckim-ud/Seoul_Redevelopment`) 선택
   - 저장소에 포함된 `render.yaml`을 Render가 자동으로 인식해 빌드/실행 명령을 채워줍니다.
   - Blueprint 메뉴가 안 보이면 `New +` → `Web Service`로 직접 만들고, Runtime `Node`, Build Command `npm install`, Start Command `npm start`, Instance Type `Free`를 수동으로 지정하세요.
3. `SEOUL_API_KEY` 환경변수 값 입력 (서울 열린데이터광장 인증키)
4. `Create Web Service` 클릭 → 첫 배포 완료까지 대기 (수 분 소요)
5. 배포가 끝나면 `https://[서비스이름].onrender.com` 형태의 공개 주소가 발급됩니다
6. 이 주소를 Kakao Developers → 앱 → `플랫폼 키` → `JavaScript 키` → `JavaScript SDK 도메인`에 추가로 등록 (기존 `http://localhost:3000`은 그대로 두고 추가)
7. 발급된 주소로 접속해 정상 동작 확인

**참고**

- Render 무료 인스턴스는 15분 동안 요청이 없으면 슬립 상태가 되고, 다음 접속 시 30~60초 정도 콜드스타트가 걸립니다. 상시 대기가 필요하면 유료 플랜(Starter, $7/월)으로 전환하세요.
- `main` 브랜치에 새로 푸시할 때마다 Render가 자동으로 재배포합니다.

## API 키 위치

| 키 | 용도 | 위치 |
|---|---|---|
| 서울 열린데이터광장 인증키 | `upisRebuild` 데이터 조회 | `server.js`의 `SEOUL_API_KEY` (환경변수 `SEOUL_API_KEY`로 재정의 가능) |
| Kakao JavaScript 키 | 지도·지오코딩 | `public/index.html`의 Kakao SDK `<script>` 태그 `appkey` 파라미터 |

## 주요 화면 구성

- **요약 카드**: 전체 사업 건수, 필터 조건 일치 건수, 지도 표시(지오코딩 성공) 건수, 지오코딩 실패 건수
- **필터**: 대분류 → 중분류 → 소분류 계단식(cascading) 선택, 조서유형, 위치명·지역명 키워드 검색, 지도 표시 개수 제한
- **지도**: 지오코딩된 사업 위치를 마커로 표시, 밀집 지역은 클러스터링, 마커 클릭 시 상세 정보 인포윈도우
- **자치구별 분포**: 지도에 표시된 항목을 자치구별로 집계
- **지도 표시 목록 / 지오코딩 실패 목록**: 사이드바 테이블, 목록 클릭 시 해당 마커로 지도 이동

## 제한사항

- 원본 데이터에 좌표가 없어 주소 지오코딩에 의존합니다. `PSTN_NM`이 "~번지 일대"처럼 비정형 표기인 경우 일부 지오코딩이 실패할 수 있으며, 실패한 항목은 "지오코딩 실패 목록"에서 확인할 수 있습니다.
- 전체 데이터는 약 6,500여 건으로, 한 번에 모두 지오코딩하면 시간이 오래 걸립니다. 기본적으로 필터와 "지도 표시 개수" 제한을 통해 표시 범위를 조절하도록 설계했습니다.
- 지오코딩 결과는 브라우저 `localStorage`에 주소 단위로 캐싱되어, 동일 주소는 재방문 시 다시 호출하지 않습니다.
- 서버는 서울 열린데이터광장 응답을 1시간 동안 메모리에 캐싱합니다. 최신 데이터를 강제로 다시 받아오려면 대시보드의 "새로고침" 버튼을 누르세요.

## 데이터 출처

- [서울 열린데이터광장 - 서울시 도시계획 정비사업 현황](https://data.seoul.go.kr) (`upisRebuild`)
