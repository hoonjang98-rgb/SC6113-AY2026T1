# 전체 코드 리뷰 및 수정 내역

검토 기준: `893d1fd3fd5a29088967734052bced97de73a6f1` (main, update deposit).
GitHub의 소스 파일 7개를 모두 읽고, Flask → HTML → Web3.js → 계약 호출 흐름을 검토했습니다.
첨부 스크린샷의 `depositMoney...` 파일과 로컬 미커밋 변경 내용은 GitHub에 없으므로 검토 대상으로 복원할 수 없었습니다. 저장소의 실제 파일명은 `templates/deposit.html`입니다.

## 실행을 막는 문제

| 우선순위 | 원래 파일·위치 | 재현 및 영향 | 수정 |
|---|---|---|---|
| P1 | templates/main.html 전체 | 내용이 줄바꿈 하나뿐이어서 Main 버튼을 누르면 빈 페이지 | 공통 메뉴를 상속해 Transfer / Deposit으로 이동 가능 |
| P1 | templates/deposit.html의 DEPOSIT_CONTRACT_ADDRESS | 주소가 PASTE_DEPLOYED... 문자열이어서 모든 계약 작업 실패 | .env 설정, 설정 오류·배포 코드 확인, 실제 배포할 Solidity 소스 추가 |
| P1 | templates/transferMoney.html의 contractAddress | 네트워크 정보 없이 주소 하나만 고정. 다른 체인에서는 실패하거나 같은 주소의 다른 계약에 호출 가능 | 주소와 CHAIN_ID 외부 설정, 호출 전후 체인 검사 |
| P1 | templates/transferMoney.html의 payer / accounts[0] | 입력 payer와 실제 서명자가 달라도 호출. 계약이 검사하면 revert, 검사하지 않으면 타인 잔액 처리 위험 | payer를 연결 계정으로 고정. 새 계약에서도 msg.sender 일치 필수 |
| P2 | templates/index.html 메뉴 | 입금 메뉴가 없어 홈페이지에서 Deposit을 찾을 수 없음. Exit가 자기 자신으로 POST | 입금·송금 GET 링크 제공, 의미 없는 Exit 제거 |
| P2 | 두 거래 화면의 금액 입력 | 양수 문자열 정규식만 있고 uint256 상한이 없음. 과도한 금액은 인코딩 실패 | 1 이상 2^256−1 이하 검증. 문자열 유지로 JS 정밀도 손실 방지 |
| P2 | 두 거래 화면의 비동기 처리 | 반복 클릭 시 여러 지갑 요청·트랜잭션 발생. 진행 도중 계정·체인 변경 미처리 | 작업 잠금, 상태 변경 무효화, 서명 직전 재검사, 확인 영수증 검사 |
| P2 | 저장소 전체 | 계약 소스·배포 방법·테스트·설정 예제가 없어 재현 불가 | 계약, .env.example, 실행 안내, 자동 테스트 추가 |

기존 계약 주소에 어떤 코드가 배포되어 있는지, 어느 체인에서 동작하는지는 저장소만으로 확인할 수 없었습니다.
따라서 기존 배포 계약에 보안 문제가 있다고 단정하지 않습니다. 새 CourseLedger의 권한 검사는 소스와 EVM 테스트로 검증했습니다.

## 기존 파일별 최종 변경

### app.py

기존 서버는 템플릿을 전달하는 역할이었습니다. 트랜잭션이 브라우저에서 실행되므로 서버에 송금 POST 처리가 없다는 사실 자체는 오류가 아닙니다.

앱 팩터리, .env 로딩, 공개 설정 세 항목만 전달하는 context processor를 추가했습니다.
정상 화면 이동은 GET 링크를 사용하고, 예전 POST 링크는 303으로 GET에 연결해 호환성을 유지합니다.
임의 서버 환경변수·비밀키를 브라우저로 내보내지 않습니다.

### templates/index.html

완전한 HTML 문서는 base.html로 공통화했습니다.
메인에서 두 기능으로 이동할 수 있고, 미설정 상태와 실습 크레딧의 의미를 표시합니다.
이 앱에는 로그인 세션이 없으므로 기존 Exit를 로그아웃처럼 표시하지 않습니다.

### templates/main.html

빈 파일을 수정하여 index.html 메뉴를 재사용합니다.
직접 /main에 들어가거나 기존 POST Main 버튼을 사용해도 빈 화면이 나타나지 않습니다.

### templates/transferMoney.html

사용자 입력 payer를 제거하고 읽기 전용 지갑 계정 표시로 바꿨습니다.
주소·양수 정수·범위·체인·배포 코드·계정 변경을 확인합니다.
alert 대신 진행 상태와 거래 해시를 페이지에 표시합니다. 인라인 JavaScript는 dapp.js로 분리했습니다.

### templates/deposit.html

주소 자리표시자와 중복 지갑 코드를 제거했습니다.
저장과 조회를 분리하고, 조회에는 서명 트랜잭션이나 계정 권한 요청이 필요 없습니다.
최근 입금은 전체 계정 중 최신 기록이라는 의미를 명시했습니다.
서로 다른 체인·계정의 이전 조회 결과가 화면에 남지 않게 처리합니다.

### static/styles.css

기존 width:100% 입력에 padding·border가 추가되어 카드 밖으로 넘칠 수 있었습니다.
box-sizing:border-box와 min-width:0을 적용했습니다.
고정 height:100vh를 min-height로 바꾸고 긴 주소·해시 줄바꿈, 키보드 포커스, 비활성 버튼, 오류 색상을 추가했습니다.

### requirements.txt

Flask와 Gunicorn의 버전 범위를 제한하고 python-dotenv를 추가했습니다.
Windows에서는 Gunicorn을 설치하지 않도록 플랫폼 조건을 넣었습니다.
계약 테스트용 Web3.py·PyEVM·컴파일러는 requirements-test.txt로 분리했습니다.

## 신규 계약 설계

원본 저장소에는 Solidity 소스가 없었습니다. 사용자의 Remix 작업 요청에 따라 `CourseLedger.sol`을 새로 작성했습니다.

원래 ABI의 함수 시그니처를 보존합니다:

- depositMoney(address,uint256): 자신의 데모 잔액 증가 및 최신 기록 저장
- viewDeposit(): 마지막 입금인·입금액 반환
- transfer(address,address,uint256): 자신의 데모 잔액을 다른 계정으로 이동
- balanceOf(address): 추가한 잔액 조회 함수

입금으로 크레딧을 생성하는 것은 이번에 정의한 **학습용 동작**이며, 기존 배포 계약의 내부 동작을 복원했다고 주장하지 않습니다.
실제 ETH, ERC-20 자산 보관, 출금, 이자 기능은 없습니다.
다른 송신자 사칭, 잔액 부족, 0원, 0주소, 자기 송금 및 산술 오버플로를 거절합니다.
프런트엔드 검사는 사용자 안내이고, 권한·잔액 검증은 Solidity에서도 강제합니다.

## 검증 결과와 한계

- Flask 테스트 8개: 화면·경로·설정 직렬화·비밀값 제외·정적 파일 확인.
- JavaScript 테스트 21개: 범위값·체인·주소·계정 변경·거절·영수증·비동기 무효화.
- Solidity / PyEVM 테스트 11개: 실제 바이트코드 배포, 장부 상태 및 거절 조건.
- 브라우저 통합 7개 시나리오: 실제 Web3.js + PyEVM 입금·조회·송금, 중복 제출, 잔액 부족, 취소, 네트워크 변경, 360px 화면.
- Remix 0.8.30 컴파일 및 VM 배포: 입금 100, 송금 30, 잔액 70/30, 최신 입금 100 확인.
- pip check와 git diff --check 통과.

Remix 검증은 자동화용 별도 브라우저 세션에서 수행했습니다. 사용자가 열어 둔 다른 Remix 탭의 파일·상태와 자동 공유되지 않습니다.
VM 주소는 외부 지갑용 배포 주소가 아닙니다. 외부 웹앱 사용에는 지갑이 접근할 수 있는 체인에 별도 배포하고 .env를 채워야 합니다.
공개 테스트넷 배포, 실제 MetaMask 확장 승인, 사용자의 기존 Codespace 내부 실행은 이번 검증 범위에 포함되지 않습니다.
Codespaces 설정 파일은 추가했지만 실제 클라우드 컨테이너 재빌드는 검증하지 않았습니다.

