const FluidMathTester = artifacts.require("./FluidMathTester.sol")

contract('FluidMath', async accounts => {
  let fluidMathTester
  beforeEach('deploy tester', async () => {
    fluidMathTester = await FluidMathTester.new()
  })

  const checkFunction = async (func, cond, params) => {
    assert.equal(await fluidMathTester[func](...params), cond(...params))
  }

  it('max works if a > b', async () => {
    await checkFunction('callMax', (a, b) => Math.max(a, b), [2, 1])
  })

  it('max works if a = b', async () => {
    await checkFunction('callMax', (a, b) => Math.max(a, b), [2, 2])
  })

  it('max works if a < b', async () => {
    await checkFunction('callMax', (a, b) => Math.max(a, b), [1, 2])
  })
})
