#include <iostream>
#include <string>
#include "src/dice_character_parse.h"

int main() {
    std::string test1 = "力量STR=3D6*5=60/30/12 体质CON=3D6*5=40/20/8";
    std::string test2 = "生命值HP=(SIZ+CON)/10=10 魔法值MP=POW/5=6";
    
    std::cout << "Test 1: " << test1 << std::endl;
    std::cout << "Result: " << parseCOCAttributes(test1) << std::endl << std::endl;
    
    std::cout << "Test 2: " << test2 << std::endl;
    std::cout << "Result: " << parseCOCAttributes(test2) << std::endl << std::endl;
    
    return 0;
}
