package game.model;

public class Candy {
    private CandyColor color;
    private CandyType type;

    public Candy(CandyColor color, CandyType type) {
        this.color = color;
        this.type = type;
    }

    public CandyColor getColor() {
        return color;
    }

    public CandyType getType() {
        return type;
    }

    public void setColor(CandyColor color) {
        this.color = color;
    }

    public void setType(CandyType type) {
        this.type = type;
    }

    @Override
    public String toString() {
        return color.toString().substring(0, 1);
    }
}