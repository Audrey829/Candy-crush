package game.model;

import java.util.Random;

public class Board {
    private int rows;
    private int cols;
    private String[][] grid;
    private Random random = new Random();

    public Board(int rows, int cols) {
        this.rows = rows;
        this.cols = cols;
        this.grid = new String[rows][cols];
    }

    public void initializeRandom() {
        String[] colors = {"R", "G", "B", "Y", "P"};
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                grid[r][c] = colors[random.nextInt(colors.length)];
            }
        }
    }

    public void printBoard() {
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                System.out.print(grid[r][c] + " ");
            }
            System.out.println();
        }
    }
}