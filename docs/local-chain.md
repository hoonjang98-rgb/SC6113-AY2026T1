# 로컬 실습 체인과 웹앱 연결

이 저장소의 로컬 체인은 공식 Anvil 1.7.1을 사용합니다. Solidity 0.8.30 / Prague 계약과 연결합니다.

## 실행

1. 프로젝트 의존성을 `npx --yes pnpm@11.19.0 install --frozen-lockfile --ignore-scripts`로 설치합니다.
2. 첫 번째 터미널에서 `npm run chain`을 실행하고 열린 상태로 둡니다.
3. 두 번째 터미널에서 가상환경 Python으로 `-m pip install -r requirements-chain.txt`를 실행합니다.
4. 같은 Python으로 `tools/deploy_local.py --install --write-env`를 실행합니다.
5. Flask를 실행합니다. 로컬은 `python -m flask --app app run --port=5000`을 사용합니다.

Anvil RPC: `http://127.0.0.1:8545`, chain ID: `31337`, 가스 표시 단위: `ETH`.
계약 주소는 배포 도구 출력과 `.cache/local-deployment.json`에 있습니다.
공개 설정 세 항목만 .env에 갱신하며 다른 설정은 보존합니다.
Anvil은 `.cache/anvil-state.json`에 주기적으로 상태를 저장합니다. 이 파일이 없는 새 체인에서는 다시 배포하세요.

## Remix에서 같은 로컬 체인에 배포

- 로컬 체인이 실행 중인 PC의 브라우저에서 https://app.remix.live 를 엽니다.
- CourseLedger.sol을 업로드하고 0.8.30 / Prague / 최적화 해제로 컴파일합니다.
- Deploy & Run에서 External HTTP Provider를 선택하고 `http://127.0.0.1:8545`를 입력합니다.
- 또는 해당 로컬 네트워크에 연결된 MetaMask의 Browser Extension 환경을 사용합니다.
- Value 0으로 CourseLedger를 배포합니다.
- 배포 주소를 `python tools/deploy_local.py --address 0x배포주소 --write-env`에 넣습니다.

도구는 선택한 주소의 실제 바이트코드가 이 소스의 컴파일 결과와 같은지 검사합니다.
네트워크와 계약 주소를 설정한 뒤 Flask를 재시작합니다.

## 지갑 연결

MetaMask가 설치된 PC 브라우저에서 사용자 지정 네트워크를 추가합니다.

| 항목 | 값 |
|---|---|
| 네트워크 이름 | SC6113 Local |
| RPC URL | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| 통화 기호 | ETH |

실제 사용하는 지갑 주소를 이 체인에 연결하면 됩니다. 가스용 테스트 ETH가 필요할 경우 로컬 Anvil의 `anvil_setBalance`로 해당 주소만 충전할 수 있습니다.
Anvil이 제공하는 계정을 지갑에 추가할 경우에는 로컬 실습 전용 계정으로 사용하세요.
입금 100 → 다른 계정으로 송금 30 → 잔액 70/30 순서로 확인합니다.

## Codespaces 웹앱에서 PC 체인 사용

Flask는 화면을 제공하고 트랜잭션은 PC의 MetaMask가 실행하므로, 웹앱과 체인이 같은 컴퓨터에 있을 필요는 없습니다.

1. PC에서 Anvil과 계약을 실행합니다.
2. Codespaces의 .env에 PC 체인의 chain ID와 배포 주소를 입력합니다.
3. Codespaces에서 `python -m flask --app app run --host=0.0.0.0 --port=5000`을 실행합니다.
4. 5000 포트의 미리보기 URL을 MetaMask가 설치된 PC 브라우저에서 엽니다.
5. 지갑을 위 로컬 네트워크에 연결하고 Deposit / Transfer를 사용합니다.

Codespaces 자체에서 Anvil을 실행하는 경우, 지갑에는 PC localhost 대신 실제 접근 가능한 포워딩 RPC 주소가 필요합니다.
GitHub 인증이 필요한 private 포트는 지갑 RPC 요청에 그대로 사용할 수 없는 경우가 있으므로, 위 PC 체인 구성이 간단합니다.

## 이번 실행 확인

2026-09-30, PC 로컬 Anvil에 배포한 주소:
`0x5FbDB2315678afecb367f032d93F642f64180aa3`

입금 100, 송금 30, 송금인 70 / 수신인 30, 최신 입금 100을 확인했습니다.
이 주소는 이번 로컬 체인의 기록이며 다른 체인의 같은 주소에 계약이 있다고 보장하지 않습니다.
Codespaces 내부 실행과 실제 MetaMask 승인 단계는 브라우저 제어 연결이 복구된 뒤 확인해야 합니다.

공식 참고: [Anvil](https://getfoundry.sh/anvil/), [Remix 배포 환경](https://remix-ide.readthedocs.io/en/latest/run.html).
