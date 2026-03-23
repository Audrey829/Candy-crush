package game;

import game.model.Board;

public class Main {
    public static void main(String[] args) {
        System.out.println("Project started!");

        Board board = new Board(9, 9);
        board.initializeRandom();
        board.printBoard();
    }
}