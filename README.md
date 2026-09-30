# SC6113 Course DApp

Flask + MetaMask + Solidity 수업용 예제입니다. **실제 은행 입금·ETH 송금이 아니라 실습용 크레딧 장부**입니다. 누구나 자신의 크레딧을 생성할 수 있으므로 금전적 가치가 없습니다.

전체 파일별 검토는 [REVIEW.md](REVIEW.md), Remix 실행 결과는 [docs/remix-validation.md](docs/remix-validation.md)를 참고하세요.

## 1. 웹 화면 실행

Python 3.12를 권장합니다. Flask는 HTML을 제공하고, 계약 트랜잭션은 브라우저 지갑에서 서명합니다.

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe app.py
```

가상환경 활성화가 필요 없으므로 PowerShell 실행 정책을 변경할 필요도 없습니다.
`python`이 Microsoft Store로 연결되면 Python 설치 경로의 실행 파일을 사용하세요.

Linux / macOS:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
.venv/bin/python app.py
```

[http://127.0.0.1:5000](http://127.0.0.1:5000)에서 Main → Deposit / Transfer를 엽니다.
설정이 비어 있어도 화면은 열리며, 계약 작업에는 아래 배포·설정 단계가 필요합니다.

## 2. Remix에서 계약 실행

1. [Remix](https://remix.ethereum.org)를 열고 `contracts/CourseLedger.sol`을 업로드합니다.
2. Solidity Compiler에서 **0.8.30**, EVM **prague**, 최적화 **해제**를 선택하고 컴파일합니다.
3. Deploy & Run의 Environment에서 **Remix VM**을 선택합니다. 최신 VM도 Prague 코드를 실행할 수 있습니다.
4. Value를 **0**으로 두고 `CourseLedger`를 Deploy합니다.
5. Account 1 주소를 복사하여 `depositMoney(Account1, 100)`을 호출합니다.
6. `viewDeposit()`은 Account 1과 100, `balanceOf(Account1)`은 100을 반환합니다.
7. Account 1을 선택한 상태에서 `transfer(Account1, Account2, 30)`을 호출합니다.
8. 두 계정의 `balanceOf`는 각각 **70 / 30**입니다.
9. Account 2로 전환한 뒤 Account 1을 payer로 지정하면 `Payer must be sender`로 거절됩니다.

`viewDeposit()`은 **모든 계정 중 가장 최근의 입금 기록**입니다. 누적 잔액은 `balanceOf(address)`로 조회합니다.
`depositMoney`는 실습 크레딧 생성이며, ETH를 보내거나 ERC-20 토큰을 입금하지 않습니다.

## 3. Flask 화면과 MetaMask 연결

**Remix VM은 Remix 브라우저 내부의 별도 블록체인입니다. VM 계약 주소를 외부 Flask 화면에 복사해도 연결되지 않습니다.**

MetaMask가 접근할 수 있는 로컬 RPC 체인 또는 테스트넷에 같은 계약을 배포해야 합니다.

1. MetaMask가 설치된 브라우저에서 Remix를 엽니다.
2. 지갑의 네트워크를 선택합니다. 테스트넷이면 테스트 가스가 필요합니다.
3. Remix Environment에서 **Browser Extension / MetaMask**(구버전은 Injected Provider)를 선택합니다.
4. Solidity 0.8.30, Prague를 지원하는 네트워크에서 Value 0으로 배포하고 지갑에서 승인합니다.
5. **해당 네트워크의 chain ID와 새 배포 주소**를 `.env`에 입력합니다.

```dotenv
CHAIN_ID=배포한_네트워크의_십진수_또는_0x_체인ID
TRANSFER_CONTRACT_ADDRESS=0x배포한_주소
DEPOSIT_CONTRACT_ADDRESS=0x동일한_배포주소
```

한 개의 CourseLedger가 두 기능을 제공하므로 두 주소는 같습니다.
위 값은 설명용 자리표시자입니다. 실제 값으로 바꾼 뒤 Flask를 재시작하세요.
서버 환경변수가 있으면 `.env`보다 우선합니다.
개인키·시드 문구는 입력하지 않습니다.

Deposit에서 100 저장 → Transfer에서 지갑 연결 → 다른 주소로 30 송금 순으로 확인합니다.
잘못된 네트워크·계약 주소·잔액 부족·지갑 취소는 화면에 오류로 표시합니다.
전송 중에는 버튼을 잠그고, 성공은 영수증 확인 후 표시합니다.

## 4. GitHub Codespaces

리뷰 수정은 main에 병합되었습니다. 이미 생성한 Codespace라면 변경 사항을 먼저 보관한 뒤:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
python -m pip install -r requirements.txt
cp -n .env.example .env
python -m flask --app app run --host=0.0.0.0 --port=5000
```

Ports 탭의 **5000**을 Open in Browser로 엽니다. 포트는 기본 private 상태로 유지할 수 있습니다.
지갑 사용 시 VS Code 내부 미리보기 대신 MetaMask가 설치된 외부 브라우저에서 여세요.
`.devcontainer/devcontainer.json`은 Python 3.12, Node 24, 실행·배포 의존성 설치 및 5000 포트 포워딩을 설정합니다.
기존 Codespace에는 컨테이너 재빌드 시 적용됩니다.

Codespaces를 연결하는 것만으로 Solidity가 배포되거나 MetaMask와 같은 체인에 연결되는 것은 아닙니다.
위 3번의 배포 및 `.env` 설정도 필요합니다.
서버를 다시 시작해도 블록체인 기록은 해당 체인의 상태에 남습니다.

## 로컬 실습 체인 실행과 자동 배포

[로컬 체인 안내](docs/local-chain.md)의 절차로 Remix VM 외부에 Anvil 체인을 실행할 수 있습니다.
체인을 실행하는 PC에서 다음 순서로 진행합니다.

```bash
npx --yes pnpm@11.19.0 install --frozen-lockfile --ignore-scripts
```

첫 번째 터미널:

```bash
npm run chain
```

두 번째 터미널에서 가상환경 Python을 사용하여:

```bash
python -m pip install -r requirements-chain.txt
python tools/deploy_local.py --install --write-env
python -m flask --app app run --port=5000
```

Windows에서는 위 `python` 대신 `.venv/Scripts/python.exe`, Linux에서는 `.venv/bin/python`을 사용할 수 있습니다.
배포 도구는 로컬 Anvil(체인 ID 31337)에만 연결하며, 계약 주소와 체인 ID를 .env에 반영합니다.
같은 계약이 이미 배포되어 있으면 주소를 재사용합니다. 상태는 `.cache/anvil-state.json`에 주기적으로 저장됩니다.
Remix에서 로컬 Anvil로 직접 배포한 계약은 `--address 0x배포주소 --write-env`로 검증 후 설정할 수 있습니다.

Codespaces의 웹앱과 PC의 로컬 체인을 함께 사용할 수도 있습니다.
이때 Codespaces의 .env에는 PC에서 배포한 주소·체인 ID를 입력하고, PC 브라우저의 지갑은 `http://127.0.0.1:8545`에 연결합니다.
Codespaces의 localhost와 PC의 localhost는 서로 다르므로, 로컬 체인 RPC를 어느 컴퓨터에서 실행했는지 확인하세요.

## 5. 자동 검증

일반 웹앱 실행에는 `requirements.txt`만 필요합니다. 계약·브라우저 검증용 도구는 분리했습니다.

가상환경의 Python을 사용하여:

```bash
python -m pip install -r requirements-test.txt
python tools/compile_contract.py --install
python -m unittest discover -s tests -p "test_*.py" -v
node --test tests/dapp.test.cjs
```

컴파일러는 프로젝트 `.cache/solc`, ABI·바이트코드는 `build/CourseLedger.json`에 생성됩니다.
브라우저 통합 테스트:

```bash
npx --yes pnpm@11.19.0 install --frozen-lockfile
npx playwright install chromium
npm run test:browser
```

Linux에서 브라우저 시스템 패키지가 없으면 `npx playwright install --with-deps chromium`을 사용하세요.
기본 테스트 Python 경로는 Windows `.venv/Scripts/python.exe`, 그 외 `.venv/bin/python`입니다.
다른 환경은 `TEST_PYTHON`을 지정합니다. 설치된 Edge를 사용하려면 `BROWSER_CHANNEL=msedge`를 지정합니다.

브라우저 테스트는 실제 Web3.js ABI 인코딩과 PyEVM을 연결하지만, MetaMask 확장 자체의 승인 UI는 테스트용 EIP-1193 지갑으로 대체합니다.
`tests/browser_server.py`는 격리된 테스트 서버로만 실행되며, 일반 `app.py`에는 테스트 RPC 경로가 없습니다.

## 파일 구조

- `app.py`: Flask 화면 라우팅, 공개 계약 설정 전달
- `templates/`: Main, Transfer, Deposit 및 공통 문서 구조
- `static/dapp.js`: 지갑·체인·금액 검증과 계약 호출
- `static/styles.css`: 반응형 레이아웃과 상태 표시
- `contracts/CourseLedger.sol`: 실습용 크레딧 장부
- `tools/compile_contract.py`: 고정 Solidity 버전 컴파일
- `tests/`: Flask, JavaScript, Solidity, 브라우저 통합 검증

Web3.js 1.x 호출 방식을 유지하고 CDN 버전을 1.10.4로 고정했습니다. CDN에 접근할 수 없으면 라이브러리 로딩 오류가 표시됩니다.
이 예제는 학습 범위이며, 다른 금융 계약의 보안 감사를 대신하지 않습니다.
Gunicorn은 Windows용 실행 서버가 아니므로 Linux에서만 설치됩니다. 개발 서버를 운영 서비스에 그대로 사용하지 마세요.

공식 참고: [Remix 배포 환경](https://remix-ide.readthedocs.io/en/latest/run.html), [MetaMask Provider API](https://docs.metamask.io/metamask-connect/evm/reference/provider-api/), [Codespaces 포트 포워딩](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace).
