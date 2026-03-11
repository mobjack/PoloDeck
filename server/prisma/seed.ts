import { PrismaClient, TeamSide } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Simple connectivity check / no-op seed.
  const count = await prisma.game.count();
  console.log(`Database reachable. Existing games: ${count}`);

  if (count === 0) {
    console.log("No games found. Creating an example game...");
    const game = await prisma.game.create({
      data: {
        homeTeamName: "Home",
        awayTeamName: "Away",
        totalPeriods: 4,
        score: {
          create: {
            homeScore: 0,
            awayScore: 0,
          },
        },
        gameClock: {
          create: {
            durationMs: 8 * 60 * 1000,
            remainingMs: 8 * 60 * 1000,
            running: false,
          },
        },
        shotClock: {
          create: {
            durationMs: 30 * 1000,
            remainingMs: 30 * 1000,
            running: false,
          },
        },
        timeoutStates: {
          create: [
            {
              teamSide: TeamSide.HOME,
              fullTimeoutsRemaining: 2,
              shortTimeoutsRemaining: 1,
            },
            {
              teamSide: TeamSide.AWAY,
              fullTimeoutsRemaining: 2,
              shortTimeoutsRemaining: 1,
            },
          ],
        },
      },
    });

    console.log(`Created example game with id=${game.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

