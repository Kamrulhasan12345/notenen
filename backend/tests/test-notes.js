import axios from "axios";

// --- CONFIGURATION ---
const BASE_URL = "http://localhost:4000/api";
const API = axios.create({ baseURL: BASE_URL });

// --- SIMPLE TEST RUNNER ---
const tests = [];
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log(`\n--- Starting E2E Tests against ${BASE_URL} ---`);
  for (const t of tests) {
    try {
      await t.fn();
      passCount++;
      process.stdout.write(".");
    } catch (error) {
      failCount++;
      process.stdout.write("F");
      console.error(`\n\n[FAIL] ${t.name}`);
      if (error.isAxiosError) {
        console.error(
          "Request Failed:",
          error.config.method.toUpperCase(),
          error.config.url,
        );
        console.error("Status:", error.response?.status);
        console.error("Error Data:", error.response?.data);
      } else {
        console.error("Assertion Failed:", error.message);
      }
    }
  }

  console.log(`\n\n--- Test Summary ---`);
  console.log(`PASS: ${passCount}`);
  console.log(`FAIL: ${failCount}`);

  if (failCount > 0) {
    process.exit(1);
  }
}

// --- ASSERTION UTILITIES ---
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertStatusCode(response, expected) {
  assert(
    response.status === expected,
    `Expected status ${expected}, got ${response.status}`,
  );
}

function assertDefined(value, name = "Value") {
  assert(value !== undefined && value !== null, `${name} must be defined`);
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, message || `Expected ${expected}, got ${actual}`);
}

function assertInArray(array, predicate, message = "Item not found in array") {
  assert(array.some(predicate), message);
}

// --- GLOBAL STATE ---
const userA = {
  email: `user.a.${Date.now()}@test.com`,
  password: "Password123!",
  name: "User A",
};
const userB = {
  email: `user.b.${Date.now()}@test.com`,
  password: "Password123!",
  name: "User B",
};

const state = {
  tokenA: "",
  tokenB: "",
  userIdA: "",
  userIdB: "",
  noteIdA: "",
  noteIdShared: "",
};

// --- TEST DEFINITIONS ---

// --- 1. AUTHENTICATION SETUP ---
test("Register and Login User A", async () => {
  // Register
  let res = await API.post("/auth/register", userA);
  assertStatusCode(res, 201);

  // Login
  res = await API.post("/auth/login", {
    email: userA.email,
    password: userA.password,
  });
  assertStatusCode(res, 200);

  state.tokenA = res.data.data.accessToken;
  state.userIdA = res.data.data.user.id;
  assertDefined(state.tokenA, "User A Token");
  assertDefined(state.userIdA, "User A ID");
});

test("Register and Login User B", async () => {
  // Register
  await API.post("/auth/register", userB);

  // Login
  const res = await API.post("/auth/login", {
    email: userB.email,
    password: userB.password,
  });
  assertStatusCode(res, 200);

  state.tokenB = res.data.data.accessToken;
  state.userIdB = res.data.data.user.id;
  assertDefined(state.tokenB, "User B Token");
  assertDefined(state.userIdB, "User B ID");
});

// --- 2. BASIC CRUD OPERATIONS (User A as Owner) ---
test("Create a new note (Note A)", async () => {
  const res = await API.post(
    "/notes",
    { title: "My First Note" },
    {
      headers: { Authorization: `Bearer ${state.tokenA}` },
    },
  );

  assertStatusCode(res, 201);
  assertEqual(res.data.data.title, "My First Note");
  assertEqual(res.data.data.owner, state.userIdA);

  state.noteIdA = res.data.data._id;
  assertDefined(state.noteIdA, "Note A ID");
});

test("Create a second note for sharing (Note Shared)", async () => {
  const res = await API.post(
    "/notes",
    { title: "Shared Note" },
    {
      headers: { Authorization: `Bearer ${state.tokenA}` },
    },
  );

  assertStatusCode(res, 201);
  state.noteIdShared = res.data.data._id;
});

test("List all notes for User A (2 notes) and check for contentPreview (Truncation Check)", async () => {
  const res = await API.get("/notes", {
    headers: { Authorization: `Bearer ${state.tokenA}` },
  });

  assertStatusCode(res, 200);
  assertEqual(res.data.data.length, 2, "Should list exactly 2 notes");

  const noteA = res.data.data.find((n) => n._id === state.noteIdA);
  const noteShared = res.data.data.find((n) => n._id === state.noteIdShared);

  assertDefined(noteA, "Note A must be in the list");

  // Check for the new 'contentPreview' field
  assertDefined(noteA.contentPreview, "Note A contentPreview must be defined");

  // Check that the full 'content' field is NOT present
  assert(
    noteA.content === undefined,
    "Full content should be excluded from the list view",
  );
});

test("Get single note by ID (Note A) and check for documentState inclusion", async () => {
  const res = await API.get(`/notes/${state.noteIdA}`, {
    headers: { Authorization: `Bearer ${state.tokenA}` },
  });

  assertStatusCode(res, 200);
  assertEqual(res.data.data._id, state.noteIdA);
  // Full note should include documentState
  assertDefined(res.data.data.documentState, "Document State");
});

test("Update note title (Note A)", async () => {
  const newTitle = "Updated Note Title";
  const res = await API.patch(
    `/notes/${state.noteIdA}`,
    { title: newTitle },
    {
      headers: { Authorization: `Bearer ${state.tokenA}` },
    },
  );

  assertStatusCode(res, 200);
  assertEqual(res.data.data.title, newTitle);
});

// --- 3. SHARING AND AUTHORIZATION TESTS ---

test("Unauthorized read access (User B on Note Shared)", async () => {
  try {
    await API.get(`/notes/${state.noteIdShared}`, {
      headers: { Authorization: `Bearer ${state.tokenB}` },
    });
    throw new Error("Request should have failed with 403");
  } catch (e) {
    assertStatusCode(e.response, 403);
  }
});

test("User A shares Note Shared with User B as viewer", async () => {
  const res = await API.post(
    `/notes/${state.noteIdShared}/share`,
    {
      targetUserId: state.userIdB,
      role: "viewer",
    },
    {
      headers: { Authorization: `Bearer ${state.tokenA}` },
    },
  );

  assertStatusCode(res, 200);
  assertInArray(
    res.data.data.members,
    (m) => m.user === state.userIdB && m.role === "viewer",
    "User B not added as viewer",
  );
});

test("User B (viewer) succeeds to read Note Shared", async () => {
  const res = await API.get(`/notes/${state.noteIdShared}`, {
    headers: { Authorization: `Bearer ${state.tokenB}` },
  });
  assertStatusCode(res, 200);
});

test("User B (viewer) fails to update Note Shared (403)", async () => {
  try {
    await API.patch(
      `/notes/${state.noteIdShared}`,
      { title: "Viewer title" },
      {
        headers: { Authorization: `Bearer ${state.tokenB}` },
      },
    );
    throw new Error("Request should have failed with 403");
  } catch (e) {
    assertStatusCode(e.response, 403);
  }
});

test("User A upgrades User B to editor (Efficiency Check)", async () => {
  const res = await API.post(
    `/notes/${state.noteIdShared}/share`,
    {
      targetUserId: state.userIdB,
      role: "editor", // Change role
    },
    {
      headers: { Authorization: `Bearer ${state.tokenA}` },
    },
  );

  assertStatusCode(res, 200);

  // Check array update efficiency: should only be one entry for user B
  const bMembers = res.data.data.members.filter(
    (m) => m.user === state.userIdB,
  );
  assertEqual(
    bMembers.length,
    1,
    "Should only have one entry for User B after update",
  );
  assertEqual(bMembers[0].role, "editor", "Role should be updated to editor");
});

test("User B (editor) succeeds to update Note Shared", async () => {
  const editorTitle = "Updated by Editor B";
  const res = await API.patch(
    `/notes/${state.noteIdShared}`,
    { title: editorTitle },
    {
      headers: { Authorization: `Bearer ${state.tokenB}` },
    },
  );

  assertStatusCode(res, 200);
  assertEqual(res.data.data.title, editorTitle);
});

test("User B (editor) fails to delete Note Shared (403)", async () => {
  try {
    await API.delete(`/notes/${state.noteIdShared}`, {
      headers: { Authorization: `Bearer ${state.tokenB}` },
    });
    throw new Error("Request should have failed with 403");
  } catch (e) {
    assertStatusCode(e.response, 403);
  }
});

// --- 4. DELETION AND CLEANUP ---
test("Owner A should succeed in deleting Note A", async () => {
  const res = await API.delete(`/notes/${state.noteIdA}`, {
    headers: { Authorization: `Bearer ${state.tokenA}` },
  });

  assertStatusCode(res, 200);
});

test("Owner A should succeed in deleting shared Note", async () => {
  const res = await API.delete(`/notes/${state.noteIdShared}`, {
    headers: { Authorization: `Bearer ${state.tokenA}` },
  });

  assertStatusCode(res, 200);
});

test("Deleted note should no longer be accessible (404)", async () => {
  try {
    await API.get(`/notes/${state.noteIdA}`, {
      headers: { Authorization: `Bearer ${state.tokenA}` },
    });
    throw new Error("Request should have failed with 404");
  } catch (e) {
    assertStatusCode(e.response, 404);
  }
});

// --- EXECUTION ---
runTests();
