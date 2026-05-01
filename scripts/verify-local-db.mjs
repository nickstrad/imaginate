#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const localDatabase = {
  hosts: new Set(["localhost", "127.0.0.1"]),
  port: "5432",
  database: "imaginate",
};

function run(name, command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(`${name} failed${detail ? `:\n${detail}` : ""}`);
  }

  return result.stdout.trim();
}

function readEnvFile() {
  try {
    return readFileSync(".env", "utf8");
  } catch {
    throw new Error(
      "Missing .env. Copy the repo .env into this worktree first."
    );
  }
}

function readDatabaseUrl() {
  const match = readEnvFile().match(/^DATABASE_URL=(.*)$/m);

  if (!match || !match[1]) {
    throw new Error("DATABASE_URL is missing from .env.");
  }

  const rawValue = match[1].trim().replace(/^['"]|['"]$/g, "");

  try {
    return new URL(rawValue);
  } catch {
    throw new Error("DATABASE_URL in .env is not a valid URL.");
  }
}

function verifyLocalDatabaseUrl(url) {
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use a postgres/postgresql protocol.");
  }

  if (!localDatabase.hosts.has(url.hostname)) {
    throw new Error("DATABASE_URL must point at localhost or 127.0.0.1.");
  }

  if (url.port !== localDatabase.port) {
    throw new Error(
      `DATABASE_URL must use local Postgres port ${localDatabase.port}.`
    );
  }

  if (url.pathname.replace(/^\//, "") !== localDatabase.database) {
    throw new Error(
      `DATABASE_URL must target the ${localDatabase.database} database.`
    );
  }
}

function verifyComposeService() {
  run("docker compose config", "docker", ["compose", "config"]);

  const output = run("docker compose ps", "docker", [
    "compose",
    "ps",
    "--format",
    "json",
    "postgres",
  ]);

  const services = parseComposeServices(output);

  if (services.length === 0) {
    throw new Error(
      "Postgres is not running. Start it with `make db/local/up`."
    );
  }

  const postgres = services.find((service) => service.Service === "postgres");

  if (!postgres) {
    throw new Error(
      "Postgres is not running. Start it with `make db/local/up`."
    );
  }

  if (postgres.State !== "running") {
    throw new Error(`Postgres container is ${postgres.State}, not running.`);
  }

  if (postgres.Health && postgres.Health !== "healthy") {
    throw new Error(
      `Postgres healthcheck is ${postgres.Health}, not healthy yet.`
    );
  }
}

function parseComposeServices(output) {
  if (!output) {
    return [];
  }

  const trimmed = output.trim();

  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  return trimmed
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function verifyPrisma() {
  run("prisma validate", "npx", ["prisma", "validate"]);
  run(
    "prisma db execute",
    "npx",
    ["prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--stdin"],
    {
      input: "SELECT 1;",
    }
  );
}

function main() {
  const checks = [
    [
      "DATABASE_URL points at local Postgres",
      () => verifyLocalDatabaseUrl(readDatabaseUrl()),
    ],
    ["Docker Compose Postgres is running", verifyComposeService],
    ["Prisma schema and database connection work", verifyPrisma],
  ];

  for (const [label, check] of checks) {
    check();
    console.log(`ok - ${label}`);
  }

  console.log("Local database setup verified.");
}

try {
  main();
} catch (error) {
  console.error(`error - ${error.message}`);
  process.exit(1);
}
